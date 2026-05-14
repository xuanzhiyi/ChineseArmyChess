'use client';

import { Cell, Color, RANK_LABELS } from '@/types/game';
import { isCamp, isHQ } from '@/lib/board-config';

interface Props {
  cell: Cell;
  row: number;
  col: number;
  selected: boolean;
  isValidMove: boolean;
  myColor: Color | null;
  onClick: () => void;
}

export default function PieceCell({ cell, row, col, selected, isValidMove, myColor, onClick }: Props) {
  const camp = isCamp(row, col);
  const hq = isHQ(row, col);
  const piece = cell.piece;

  const cellBase = camp
    ? 'rounded-full border-2 border-amber-600 bg-amber-950/60'
    : hq
    ? 'rounded border-2 border-red-800 bg-red-950/40'
    : 'rounded border border-slate-600 bg-slate-800/60';

  const isMyPiece = piece && piece.faceUp && piece.color === myColor;
  const isFaceDown = piece && !piece.faceUp;

  let pieceClasses = '';
  let pieceContent: React.ReactNode = null;

  if (piece) {
    if (!piece.faceUp) {
      pieceClasses = 'bg-slate-600 border-2 border-slate-400 cursor-pointer hover:bg-slate-500';
      pieceContent = <span className="text-slate-300 text-xs">？</span>;
    } else {
      const isRed = piece.color === 'red';
      pieceClasses = `border-2 cursor-pointer ${
        isRed
          ? 'bg-red-900 border-red-500 text-red-200'
          : 'bg-slate-900 border-slate-400 text-slate-200'
      } ${selected ? 'ring-2 ring-yellow-400 scale-110' : 'hover:brightness-125'}`;
      pieceContent = (
        <span className="text-xs font-bold leading-tight text-center">
          {RANK_LABELS[piece.rank]}
        </span>
      );
    }
  }

  const validMoveIndicator = isValidMove && !piece;
  const validCaptureIndicator = isValidMove && piece;

  return (
    <div
      className={`relative flex items-center justify-center w-12 h-12 transition-all ${cellBase}`}
      style={{ fontSize: '11px' }}
    >
      {/* Camp label when empty */}
      {camp && !piece && (
        <span className="text-amber-700/50 text-[9px] select-none">行营</span>
      )}
      {/* HQ label when empty */}
      {hq && !piece && (
        <span className="text-red-800/50 text-[9px] select-none">大本营</span>
      )}

      {/* Valid move dot */}
      {validMoveIndicator && (
        <div
          className="absolute w-3 h-3 rounded-full bg-yellow-400/70 cursor-pointer hover:bg-yellow-300 z-10"
          onClick={onClick}
        />
      )}

      {/* Piece */}
      {piece && (
        <div
          onClick={onClick}
          className={`absolute inset-1 rounded flex items-center justify-center z-10 transition-all ${pieceClasses} ${
            validCaptureIndicator ? 'ring-2 ring-yellow-400' : ''
          }`}
        >
          {pieceContent}
        </div>
      )}
    </div>
  );
}
