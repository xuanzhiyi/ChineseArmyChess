import { Board, Cell, Color, GameState, Piece, Rank, RANK_ORDER } from '@/types/game';
import {
  ROWS, COLS, isCamp, isHQ,
  getAdjacentCells, getRailwayReachable, getEngineerRailwayReachable, RAILWAY_ROWS,
} from './board-config';

// Piece counts per side
const PIECE_COUNTS: Array<{ rank: Rank; count: number }> = [
  { rank: 'commander',   count: 1 },
  { rank: 'general',     count: 1 },
  { rank: 'lt_general',  count: 2 },
  { rank: 'major_general', count: 2 },
  { rank: 'colonel',     count: 2 },
  { rank: 'lt_colonel',  count: 2 },
  { rank: 'major',       count: 3 },
  { rank: 'captain',     count: 3 },
  { rank: 'engineer',    count: 3 },
  { rank: 'bomb',        count: 2 },
  { rank: 'mine',        count: 3 },
  { rank: 'flag',        count: 1 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createAllPieces(): Piece[] {
  const pieces: Piece[] = [];
  for (const color of ['red', 'black'] as Color[]) {
    for (const { rank, count } of PIECE_COUNTS) {
      for (let i = 0; i < count; i++) {
        pieces.push({
          id: `${color}-${rank}-${i}`,
          rank,
          color,
          faceUp: false,
        });
      }
    }
  }
  return pieces;
}

export function createInitialBoard(): Board {
  const pieces = shuffle(createAllPieces()); // 50 pieces

  // Collect all non-camp positions
  const normalCells: Array<[number, number]> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isCamp(r, c)) normalCells.push([r, c]);
    }
  }
  // normalCells should be exactly 50

  const board: Board = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      piece: null,
      type: isCamp(r, c) ? 'camp' : isHQ(r, c) ? 'hq' : 'normal',
    } as Cell))
  );

  pieces.forEach((piece, i) => {
    const [r, c] = normalCells[i];
    board[r][c].piece = piece;
  });

  return board;
}

// Returns valid destination cells for a piece at (row, col)
export function getValidMoves(
  board: Board,
  row: number,
  col: number,
  playerColor: Color
): Array<[number, number]> {
  const cell = board[row][col];
  if (!cell.piece || cell.piece.color !== playerColor) return [];
  if (!cell.piece.faceUp) return [];

  const piece = cell.piece;
  const rank = piece.rank;

  // Mine and flag cannot move
  if (rank === 'mine' || rank === 'flag') return [];

  const candidates: Array<[number, number]> = [];
  const onRailway = RAILWAY_ROWS.has(row) || [0, 4].includes(col);

  // Regular one-step moves (always available)
  for (const [nr, nc] of getAdjacentCells(row, col)) {
    candidates.push([nr, nc]);
  }

  // Railway sliding moves
  const isOnRailwayCell = RAILWAY_ROWS.has(row) || col === 0 || col === 4;
  if (isOnRailwayCell) {
    if (rank === 'engineer') {
      for (const pos of getEngineerRailwayReachable(row, col, board)) {
        candidates.push(pos);
      }
    } else {
      for (const pos of getRailwayReachable(row, col, board)) {
        candidates.push(pos);
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique: Array<[number, number]> = [];
  for (const [nr, nc] of candidates) {
    const k = `${nr},${nc}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push([nr, nc]);
    }
  }

  // Filter valid destinations
  return unique.filter(([nr, nc]) => {
    if (nr === row && nc === col) return false;
    const target = board[nr][nc];
    const tp = target.piece;

    // Pieces in camp cannot be attacked
    if (tp && isCamp(nr, nc)) return false;

    if (!tp) return true; // empty cell, always ok

    // Cannot move onto own piece (even if face-down)
    if (tp.color === playerColor) return false;

    // Cannot attack face-down pieces
    if (!tp.faceUp) return false;

    // Mine blocks all except engineer and bomb (only relevant when face-up)
    if (tp.faceUp && tp.rank === 'mine' && rank !== 'engineer' && rank !== 'bomb') return false;

    // Cannot make a losing attack — only attacker dies (suicide)
    if (tp.faceUp && resolveBattle(piece, tp) === 'defender_wins') return false;

    return true;
  });
}

export type BattleResult = 'attacker_wins' | 'defender_wins' | 'both_die';

export function resolveBattle(attacker: Piece, defender: Piece): BattleResult {
  // Bomb always causes mutual destruction (except flag)
  if (attacker.rank === 'bomb' || defender.rank === 'bomb') {
    return 'both_die';
  }

  // Engineer digs mine: engineer wins
  if (attacker.rank === 'engineer' && defender.rank === 'mine') {
    return 'attacker_wins';
  }

  // Mine blocks all others (attacker dies)
  if (defender.rank === 'mine') {
    return 'defender_wins';
  }

  // Flag cannot be captured normally (only after all mines cleared, by lowest piece)
  // This is enforced in applyMove before calling resolveBattle

  // Same rank: both die
  const aRank = RANK_ORDER[attacker.rank];
  const dRank = RANK_ORDER[defender.rank];
  if (aRank === dRank) return 'both_die';

  return aRank > dRank ? 'attacker_wins' : 'defender_wins';
}

export interface MoveResult {
  board: Board;
  redMines: number;
  blackMines: number;
  gameOver: boolean;
  winner?: Color;
  captured?: Piece;
}

export function applyMove(
  state: GameState,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  playerColor: Color
): MoveResult | { error: string } {
  const board = state.board.map(row => row.map(cell => ({ ...cell, piece: cell.piece ? { ...cell.piece } : null })));
  let { redMines, blackMines } = state;

  const fromCell = board[fromRow][fromCol];
  const toCell = board[toRow][toCol];
  const piece = fromCell.piece;

  if (!piece) return { error: 'No piece at source' };
  if (piece.color !== playerColor) return { error: 'Not your piece' };
  if (!piece.faceUp) return { error: 'Piece is face-down' };

  const opponentColor: Color = playerColor === 'red' ? 'black' : 'red';
  const opponentMines = opponentColor === 'red' ? redMines : blackMines;

  // Flag capture: only allowed if all opponent mines are cleared AND attacker is lowest rank
  const targetPiece = toCell.piece;
  if (targetPiece?.faceUp && targetPiece.rank === 'flag') {
    if (opponentMines > 0) return { error: '必须先清除所有地雷才能夺旗' };
    // Find lowest-rank piece of playerColor
    const myPieces = board.flat().map(c => c.piece).filter(p => p?.color === playerColor && p.faceUp) as Piece[];
    const movableRanks = myPieces
      .filter(p => p.rank !== 'mine' && p.rank !== 'flag' && p.rank !== 'bomb')
      .map(p => RANK_ORDER[p.rank]);
    const lowestRank = Math.min(...movableRanks);
    if (RANK_ORDER[piece.rank] !== lowestRank) return { error: '只有最小军阶的棋子才能夺旗' };
  }

  // Check piece is in camp: pieces in camp cannot be attacked
  if (targetPiece && isCamp(toRow, toCol)) {
    return { error: '行营中的棋子不能被攻击' };
  }

  let captured: Piece | undefined;
  let gameOver = false;
  let winner: Color | undefined;

  if (targetPiece) {
    if (!targetPiece.faceUp) {
      // Reveal and battle
      targetPiece.faceUp = true;
    }

    const result = resolveBattle(piece, targetPiece);

    if (targetPiece.rank === 'mine') {
      if (playerColor === 'red') blackMines--;
      else redMines--;
    }

    if (result === 'attacker_wins') {
      captured = targetPiece;
      toCell.piece = { ...piece };
      fromCell.piece = null;
    } else if (result === 'defender_wins') {
      fromCell.piece = null;
    } else {
      captured = targetPiece;
      fromCell.piece = null;
      toCell.piece = null;
    }

    // Check if flag was captured
    if (targetPiece.rank === 'flag' && result === 'attacker_wins') {
      gameOver = true;
      winner = playerColor;
    }
  } else {
    // Move to empty cell
    toCell.piece = { ...piece };
    fromCell.piece = null;
  }

  // Check if opponent has no pieces left
  const opponentPieces = board.flat().map(c => c.piece).filter(p => p?.color === opponentColor);
  if (opponentPieces.length === 0) {
    gameOver = true;
    winner = playerColor;
  }

  return { board, redMines, blackMines, gameOver, winner, captured };
}

export function applyFlip(
  state: GameState,
  row: number,
  col: number
): { board: Board; colorAssignment?: { red: string; black: string }; flippedPiece: Piece } | { error: string } {
  const board = state.board.map(r => r.map(cell => ({ ...cell, piece: cell.piece ? { ...cell.piece } : null })));
  const cell = board[row][col];

  if (!cell.piece) return { error: 'No piece to flip' };
  if (cell.piece.faceUp) return { error: 'Piece already revealed' };
  if (isCamp(row, col)) return { error: 'No piece in camp' };

  cell.piece.faceUp = true;
  const flippedPiece = cell.piece;

  return { board, flippedPiece };
}
