'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket-client';
import { getPlayerToken } from '@/lib/player-token';
import { Color, GameState, Room } from '@/types/game';
import Board from '@/components/Board';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faCheck, faStar, faSkull, faRightFromBracket, faFlag } from '@fortawesome/free-solid-svg-icons';

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Color | null>(null);
  const [winner, setWinner] = useState<Color | null>(null);
  const [copied, setCopied] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [message, setMessage] = useState('等待对手加入...');

  const socket = getSocket();

  useEffect(() => {
    // Request current state on mount (handles page refresh and player 2 redirect)
    socket.emit('get_room_state', code, getPlayerToken());

    socket.on('room_joined', (data) => {
      setRoom(data.room);
      if (data.yourColor) {
        setMyColor(data.yourColor);
        setMessage('');
      } else if (data.room.status === 'playing') {
        setMessage('翻开棋子，确定阵营！');
      } else {
        setMessage('等待对手加入...');
      }
      if (data.room.currentTurn) setCurrentTurn(data.room.currentTurn);
    });

    socket.on('game_state', (state) => {
      setGameState(state);
    });

    socket.on('color_assigned', (color: Color) => {
      setMyColor(color);
      setMessage('');
    });

    socket.on('turn_changed', (color) => {
      setCurrentTurn(color);
    });

    socket.on('game_over', (winnerColor) => {
      setWinner(winnerColor);
    });

    socket.on('player_left', () => {
      setOpponentLeft(true);
    });

    socket.on('error', (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(''), 3000);
    });

    return () => {
      socket.off('room_joined');
      socket.off('game_state');
      socket.off('color_assigned');
      socket.off('turn_changed');
      socket.off('game_over');
      socket.off('error');
      socket.off('player_left');
    };
  }, [socket]);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLeaveRoom() {
    socket.emit('leave_room');
    window.location.href = '/';
  }

  function handleForfeit() {
    if (!confirm('确定认输吗？对局将结束。')) return;
    socket.emit('forfeit');
  }

  function handleFlip(row: number, col: number) {
    socket.emit('flip_piece', row, col);
  }

  function handleMove(fromRow: number, fromCol: number, toRow: number, toCol: number) {
    socket.emit('move_piece', fromRow, fromCol, toRow, toCol);
  }

  const isMyTurn = myColor !== null && currentTurn === myColor;
  const phase = gameState?.phase ?? 'flipping';

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex flex-col items-center pt-2 px-3 pb-4 gap-2">
      <div className="flex flex-col gap-2 w-fit">
      {/* Header — right-aligned to game area width */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={copyCode}
          className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm font-mono tracking-widest transition-colors border border-slate-500"
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className={copied ? 'text-green-400' : 'text-slate-300'} />
          {code}
        </button>
        {myColor && (
          <button
            onClick={handleForfeit}
            className="flex items-center gap-2 bg-slate-600 hover:bg-red-700 text-white hover:text-red-200 px-3 py-1.5 rounded-lg text-sm transition-colors border border-slate-500"
            title="认输"
          >
            <FontAwesomeIcon icon={faFlag} />
          </button>
        )}
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-sm transition-colors border border-slate-500"
          title="保存并离开"
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
        </button>
      </div>

      {/* Status message (waiting / errors only) */}
      {message && (
        <div className="text-slate-300 text-sm">{message}</div>
      )}


      {/* Board */}
      {gameState ? (
        <div className="bg-slate-900/80 rounded-2xl p-3 border border-slate-700">
          <Board
            gameState={gameState}
            myColor={myColor}
            isMyTurn={isMyTurn}
            currentTurn={currentTurn}
            phase={phase as 'flipping' | 'playing'}
            onFlip={handleFlip}
            onMove={handleMove}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          加载中...
        </div>
      )}
      </div>{/* end w-fit wrapper */}

      {/* Opponent left overlay */}
      {opponentLeft && !winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4 border border-slate-600">
            <FontAwesomeIcon icon={faRightFromBracket} className="text-5xl text-slate-400" />
            <h2 className="text-2xl font-bold text-white">对方已离开房间</h2>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-red-700 hover:bg-red-600 text-white px-6 py-2 rounded-xl transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 text-center space-y-4 border border-slate-600">
            <FontAwesomeIcon
              icon={winner === myColor ? faStar : faSkull}
              className={`text-5xl ${winner === myColor ? 'text-yellow-400' : 'text-slate-500'}`}
            />
            <h2 className="text-2xl font-bold text-white">
              {winner === myColor ? '你赢了！' : '你输了'}
            </h2>
            <p className="text-slate-400 text-sm">
              {winner === 'red' ? '红方' : '黑方'}获胜
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-red-700 hover:bg-red-600 text-white px-6 py-2 rounded-xl transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
