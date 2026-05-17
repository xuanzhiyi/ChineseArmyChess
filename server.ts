import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { createInitialBoard, applyFlip, applyMove } from './lib/game-logic';
import { Color, GameState, LastMove } from './types/game';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

interface InMemoryState extends GameState {
  currentTurn: Color | null;
  phase: string;
  lastMove?: LastMove;
  // Snapshot of state before the last move (for undo)
  undoSnapshot?: { board: GameState['board']; redMines: number; blackMines: number };
}

// In-memory game states keyed by room code for fast access
const gameStates = new Map<string, InMemoryState>();

// Socket id -> { roomCode, color, playerToken }
const socketRooms = new Map<string, { roomCode: string; color: Color | null; playerToken: string }>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);

    if (req.method === 'GET' && parsedUrl.pathname === '/api/cron/cleanup') {
      const secret = process.env.CRON_SECRET;
      if (secret && parsedUrl.query['secret'] !== secret) {
        res.writeHead(401).end('Unauthorized');
        return;
      }
      const waitingCutoff  = new Date(Date.now() -  2 * 60 * 60 * 1000);
      const finishedCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const playingCutoff  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000);
      const { count } = await prisma.room.deleteMany({
        where: {
          OR: [
            { status: 'waiting',  createdAt: { lt: waitingCutoff } },
            { status: 'finished', updatedAt: { lt: finishedCutoff } },
            { status: 'playing',  updatedAt: { lt: playingCutoff } },
          ],
        },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: count }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log('connected:', socket.id);

    socket.on('create_room', async (playerToken: string) => {
      let code = generateRoomCode();
      // Ensure unique
      while (await prisma.room.findUnique({ where: { code } })) {
        code = generateRoomCode();
      }

      const room = await prisma.room.create({
        data: {
          code,
          playerRed: socket.id,
          playerRedToken: playerToken,
          status: 'waiting',
          gameState: {
            create: {
              board: createInitialBoard() as object,
              phase: 'flipping',
              redMines: 3,
              blackMines: 3,
            },
          },
        },
        include: { gameState: true },
      });

      socketRooms.set(socket.id, { roomCode: code, color: null, playerToken });
      socket.join(code);

      const gs = room.gameState!;
      const state: GameState & { currentTurn: Color | null; phase: string } = {
        board: gs.board as unknown as GameState['board'],
        redMines: gs.redMines,
        blackMines: gs.blackMines,
        phase: gs.phase as 'flipping' | 'playing',
        currentTurn: null,
      };
      gameStates.set(code, state);

      socket.emit('room_joined', {
        room: { id: room.id, code, status: room.status, playerRed: room.playerRed, playerBlack: null, currentTurn: null, winner: null },
        yourColor: null,
      });
    });

    socket.on('join_room', async (code: string, playerToken: string) => {
      const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() }, include: { gameState: true } });
      if (!room) { socket.emit('error', '房间不存在'); return; }
      if (room.status !== 'waiting') { socket.emit('error', '房间已满或游戏已开始'); return; }

      const updated = await prisma.room.update({
        where: { id: room.id },
        data: { playerBlack: socket.id, playerBlackToken: playerToken, status: 'playing', currentTurn: 'red' },
      });

      socketRooms.set(socket.id, { roomCode: code.toUpperCase(), color: null, playerToken });
      socket.join(code.toUpperCase());

      const state = gameStates.get(code.toUpperCase());
      if (state) state.currentTurn = 'red';

      // Notify both players - at this point no colors assigned yet (assigned on first mine flip)
      io.to(code.toUpperCase()).emit('room_joined', {
        room: { id: room.id, code: code.toUpperCase(), status: 'playing', playerRed: room.playerRed, playerBlack: socket.id, currentTurn: 'red', winner: null },
        yourColor: null,
      });

      if (state) {
        io.to(code.toUpperCase()).emit('game_state', state);
      }
    });

    socket.on('flip_piece', async (row: number, col: number) => {
      const sr = socketRooms.get(socket.id);
      if (!sr) return;
      const { roomCode } = sr;
      const state = gameStates.get(roomCode);
      if (!state) return;

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return;

      // Whose turn is it?
      const turnColor = state.currentTurn;
      // Before colors are assigned, anyone can flip
      // After colors assigned, only the current turn player can flip
      if (turnColor && sr.color && sr.color !== turnColor) {
        socket.emit('error', '还没到你的回合'); return;
      }

      const result = applyFlip(state, row, col);
      if ('error' in result) { socket.emit('error', result.error); return; }

      state.board = result.board;

      // Check if a mine was flipped and colors not yet assigned
      if (result.flippedPiece.rank === 'mine' && state.phase === 'flipping') {
        // The player who flipped gets this mine's color; other gets opposite
        const flippedColor = result.flippedPiece.color;
        const otherColor: Color = flippedColor === 'red' ? 'black' : 'red';

        // Assign colors: current socket gets flippedColor, opponent gets otherColor
        // Determine socket IDs from in-memory map (more reliable than fetchSockets)
        let redSocketId: string | null = null;
        let blackSocketId: string | null = null;
        let redPlayerToken: string | null = null;
        let blackPlayerToken: string | null = null;

        // Update flipper
        const flipperInfo = socketRooms.get(socket.id);
        const flipperToken = flipperInfo?.playerToken ?? '';
        socketRooms.set(socket.id, { roomCode, color: flippedColor, playerToken: flipperToken });
        if (flippedColor === 'red') { redSocketId = socket.id; redPlayerToken = flipperToken; }
        else { blackSocketId = socket.id; blackPlayerToken = flipperToken; }

        // Update opponent — find their socket in the room
        const allSockets = await io.in(roomCode).fetchSockets();
        for (const s of allSockets) {
          if (s.id === socket.id) continue;
          const info = socketRooms.get(s.id);
          const opponentToken = info?.playerToken ?? '';
          socketRooms.set(s.id, { roomCode, color: otherColor, playerToken: opponentToken });
          if (otherColor === 'red') { redSocketId = s.id; redPlayerToken = opponentToken; }
          else { blackSocketId = s.id; blackPlayerToken = opponentToken; }
          // Tell opponent their color directly
          s.emit('color_assigned', otherColor);
        }

        state.phase = 'playing';
        // Turn goes to the opponent (not the player who flipped the mine)
        state.currentTurn = otherColor;

        await prisma.room.update({
          where: { code: roomCode },
          data: {
            playerRed: redSocketId,
            playerBlack: blackSocketId,
            playerRedToken: redPlayerToken,
            playerBlackToken: blackPlayerToken,
            currentTurn: otherColor,
          },
        });
        await prisma.gameState.update({
          where: { roomId: room.id },
          data: { board: state.board as object, phase: 'playing' },
        });

        // Tell the flipper their color directly
        socket.emit('color_assigned', flippedColor);
      } else {
        // Regular flip - switch turn
        state.currentTurn = state.currentTurn === 'red' ? 'black' : 'red';
        await Promise.all([
          prisma.gameState.update({ where: { roomId: room.id }, data: { board: state.board as object } }),
          prisma.room.update({ where: { code: roomCode }, data: { currentTurn: state.currentTurn } }),
        ]);
      }

      // Log move
      const moveCount = await prisma.move.count({ where: { roomId: room.id } });
      await prisma.move.create({
        data: {
          roomId: room.id,
          moveNum: moveCount + 1,
          type: 'flip',
          playerToken: sr.playerToken,
          color: state.currentTurn,
          toRow: row,
          toCol: col,
          piece: result.flippedPiece as object,
        },
      });

      state.lastMove = { fromRow: row, fromCol: col, toRow: row, toCol: col, type: 'flip', by: state.currentTurn! };
      state.undoSnapshot = undefined; // flips clear the undo snapshot
      io.to(roomCode).emit('game_state', state);
      io.to(roomCode).emit('turn_changed', state.currentTurn!);
    });

    socket.on('move_piece', async (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
      const sr = socketRooms.get(socket.id);
      if (!sr) return;
      const { roomCode, color } = sr;
      if (!color) { socket.emit('error', '颜色未分配'); return; }

      const state = gameStates.get(roomCode);
      if (!state) return;
      if (state.currentTurn !== color) { socket.emit('error', '还没到你的回合'); return; }

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return;

      // Save snapshot before applying move (for undo)
      const snapshot = {
        board: JSON.parse(JSON.stringify(state.board)) as GameState['board'],
        redMines: state.redMines,
        blackMines: state.blackMines,
      };

      const result = applyMove(state, fromRow, fromCol, toRow, toCol, color);
      if ('error' in result) { socket.emit('error', result.error); return; }

      state.board = result.board;
      state.redMines = result.redMines;
      state.blackMines = result.blackMines;
      state.undoSnapshot = snapshot;

      await prisma.gameState.update({
        where: { roomId: room.id },
        data: { board: state.board as object, redMines: state.redMines, blackMines: state.blackMines },
      });

      const moveCount = await prisma.move.count({ where: { roomId: room.id } });
      await prisma.move.create({
        data: {
          roomId: room.id,
          moveNum: moveCount + 1,
          type: 'move',
          playerToken: sr.playerToken,
          color,
          fromRow,
          fromCol,
          toRow,
          toCol,
          piece: state.board[toRow][toCol]?.piece as object ?? null,
          captured: result.captured as object ?? null,
        },
      });

      state.lastMove = { fromRow, fromCol, toRow, toCol, type: 'move', by: color };

      if (result.gameOver && result.winner) {
        await prisma.room.update({ where: { code: roomCode }, data: { status: 'finished', winner: result.winner } });
        io.to(roomCode).emit('game_state', state);
        io.to(roomCode).emit('game_over', result.winner);
        return;
      }

      state.currentTurn = color === 'red' ? 'black' : 'red';
      await prisma.room.update({ where: { code: roomCode }, data: { currentTurn: state.currentTurn } });
      io.to(roomCode).emit('game_state', state);
      io.to(roomCode).emit('turn_changed', state.currentTurn);
    });

    socket.on('get_room_state', async (code: string, clientToken?: string) => {
      const upperCode = code.toUpperCase();
      const room = await prisma.room.findUnique({ where: { code: upperCode } });
      if (!room) { socket.emit('error', '房间不存在'); return; }

      socket.join(upperCode);

      // Match player by token (handles reconnection with new socket ID)
      let color: Color | null = null;
      let playerToken = '';

      if (clientToken && room.playerRedToken === clientToken) {
        color = 'red'; playerToken = clientToken;
      } else if (clientToken && room.playerBlackToken === clientToken) {
        color = 'black'; playerToken = clientToken;
      } else if (room.playerRed === socket.id) {
        color = 'red'; playerToken = room.playerRedToken ?? '';
      } else if (room.playerBlack === socket.id) {
        color = 'black'; playerToken = room.playerBlackToken ?? '';
      }

      // Update socket ID in DB so future moves are attributed correctly
      if (color === 'red' && room.playerRed !== socket.id) {
        await prisma.room.update({ where: { code: upperCode }, data: { playerRed: socket.id } });
      } else if (color === 'black' && room.playerBlack !== socket.id) {
        await prisma.room.update({ where: { code: upperCode }, data: { playerBlack: socket.id } });
      }

      socketRooms.set(socket.id, { roomCode: upperCode, color, playerToken });

      socket.emit('room_joined', {
        room: {
          id: room.id, code: upperCode, status: room.status,
          playerRed: room.playerRed, playerBlack: room.playerBlack,
          currentTurn: room.currentTurn as Color | null,
          winner: room.winner as Color | null,
        },
        yourColor: color,
      });

      let state = gameStates.get(upperCode);
      if (!state) {
        // Reload from DB after server restart
        const gs = await prisma.gameState.findUnique({ where: { roomId: room.id } });
        if (gs) {
          state = {
            board: gs.board as unknown as GameState['board'],
            redMines: gs.redMines,
            blackMines: gs.blackMines,
            phase: gs.phase as 'flipping' | 'playing',
            currentTurn: room.currentTurn as Color | null,
          };
          gameStates.set(upperCode, state);
        }
      }
      if (state) {
        socket.emit('game_state', state);
        if (state.currentTurn) socket.emit('turn_changed', state.currentTurn);
      }

      if (color) {
        socket.emit('color_assigned', color);
      }
    });

    socket.on('get_my_rooms', async (playerToken: string) => {
      const rooms = await prisma.room.findMany({
        where: {
          status: { not: 'finished' },
          OR: [{ playerRedToken: playerToken }, { playerBlackToken: playerToken }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { code: true, updatedAt: true },
      });
      socket.emit('my_rooms', rooms.map(r => ({ code: r.code, updatedAt: r.updatedAt.toISOString() })));
    });

    socket.on('leave_room', () => {
      const sr = socketRooms.get(socket.id);
      if (!sr) return;
      const { roomCode } = sr;
      socket.to(roomCode).emit('player_left');
      socketRooms.delete(socket.id);
      socket.leave(roomCode);
      // Game state preserved — player can rejoin later
    });

    socket.on('forfeit', async () => {
      const sr = socketRooms.get(socket.id);
      if (!sr || !sr.color) return;
      const { roomCode } = sr;
      const winner: Color = sr.color === 'red' ? 'black' : 'red';
      await prisma.room.update({ where: { code: roomCode }, data: { status: 'finished', winner } });
      io.to(roomCode).emit('game_over', winner);
      socketRooms.delete(socket.id);
    });

    socket.on('request_undo', () => {
      const sr = socketRooms.get(socket.id);
      if (!sr || !sr.color) return;
      const { roomCode, color } = sr;
      const state = gameStates.get(roomCode);
      if (!state) return;
      // Only allow if last move was a move (not flip) made by this player
      if (!state.undoSnapshot || !state.lastMove || state.lastMove.type !== 'move' || state.lastMove.by !== color) {
        socket.emit('error', '无法悔棋'); return;
      }
      // Notify opponent
      socket.to(roomCode).emit('undo_requested');
    });

    socket.on('undo_response', async (accept: boolean) => {
      const sr = socketRooms.get(socket.id);
      if (!sr || !sr.color) return;
      const { roomCode, color } = sr;
      const state = gameStates.get(roomCode);
      if (!state || !state.undoSnapshot || !state.lastMove || state.lastMove.type !== 'move') return;

      if (!accept) {
        socket.to(roomCode).emit('undo_rejected');
        return;
      }

      // Revert to snapshot
      const requesterColor = state.lastMove.by!; // the player who requested undo
      state.board = state.undoSnapshot.board;
      state.redMines = state.undoSnapshot.redMines;
      state.blackMines = state.undoSnapshot.blackMines;
      state.currentTurn = requesterColor; // give turn back to the requester
      state.lastMove = undefined;
      state.undoSnapshot = undefined;

      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (room) {
        await Promise.all([
          prisma.gameState.update({ where: { roomId: room.id }, data: { board: state.board as object, redMines: state.redMines, blackMines: state.blackMines } }),
          prisma.room.update({ where: { code: roomCode }, data: { currentTurn: requesterColor } }),
        ]);
      }

      io.to(roomCode).emit('game_state', state);
      io.to(roomCode).emit('turn_changed', requesterColor);
    });

    socket.on('disconnect', () => {
      socketRooms.delete(socket.id);
      console.log('disconnected:', socket.id);
    });
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
