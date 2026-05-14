'use client';

import { useState, useCallback } from 'react';
import { Board as BoardType, Color, GameState } from '@/types/game';
import { getValidMoves } from '@/lib/game-logic';
import { isCamp } from '@/lib/board-config';
import PieceCell from './PieceCell';

interface Props {
  gameState: GameState;
  myColor: Color | null;
  isMyTurn: boolean;
  phase: 'flipping' | 'playing';
  onFlip: (row: number, col: number) => void;
  onMove: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
}

export default function Board({ gameState, myColor, isMyTurn, phase, onFlip, onMove }: Props) {
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<Set<string>>(new Set());

  const board = gameState.board;

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!isMyTurn) return;
    const cell = board[row][col];

    if (phase === 'flipping') {
      // Only flip face-down pieces
      if (cell.piece && !cell.piece.faceUp && !isCamp(row, col)) {
        onFlip(row, col);
      }
      return;
    }

    // Playing phase
    if (selected) {
      const [selRow, selCol] = selected;
      const key = `${row},${col}`;

      if (validMoves.has(key)) {
        // Execute move
        onMove(selRow, selCol, row, col);
        setSelected(null);
        setValidMoves(new Set());
        return;
      }

      // Deselect or select new piece
      setSelected(null);
      setValidMoves(new Set());
    }

    // Select a piece
    if (cell.piece && cell.piece.faceUp && cell.piece.color === myColor) {
      const moves = getValidMoves(board, row, col, myColor!);
      setSelected([row, col]);
      setValidMoves(new Set(moves.map(([r, c]) => `${r},${c}`)));
    } else if (cell.piece && !cell.piece.faceUp && !isCamp(row, col)) {
      // Flip a face-down piece during playing phase
      onFlip(row, col);
    }
  }, [board, isMyTurn, myColor, onFlip, onMove, phase, selected, validMoves]);

  return (
    <div className="flex flex-col items-center gap-0">
      {board.map((rowCells, rowIdx) => (
        <div key={rowIdx}>
          {/* Extra gap before row 6 (0-indexed) = front line */}
          {rowIdx === 6 && (
            <div className="flex items-center justify-center h-8">
              <div className="flex-1 h-px bg-red-800/50" />
              <span className="text-red-700/70 text-xs px-3 select-none tracking-widest">前线</span>
              <div className="flex-1 h-px bg-red-800/50" />
            </div>
          )}
          <div className="flex gap-0">
            {rowCells.map((cell, colIdx) => (
              <PieceCell
                key={colIdx}
                cell={cell}
                row={rowIdx}
                col={colIdx}
                selected={selected?.[0] === rowIdx && selected?.[1] === colIdx}
                isValidMove={validMoves.has(`${rowIdx},${colIdx}`)}
                myColor={myColor}
                onClick={() => handleCellClick(rowIdx, colIdx)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
