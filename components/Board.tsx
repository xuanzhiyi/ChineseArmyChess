'use client';

import { useState, useCallback, useMemo } from 'react';
import { Color, GameState, RANK_LABELS } from '@/types/game';
import { getValidMoves } from '@/lib/game-logic';
import { isCamp, isHQ, CAMP_POSITIONS } from '@/lib/board-config';

// SVG layout constants (matches verified board-draft.html)
const CW = 72, CH = 58, GAP = 45, PAD = 48;
const SVG_W = PAD * 2 + CW * 4;
const SVG_H = PAD * 2 + CH * 11 + GAP;

function gx(col: number) { return PAD + col * CW; }
function gy(row: number) { return PAD + row * CH + (row >= 6 ? GAP : 0); }

const RAIL_RED = '#c0392b';
const REG_COLOR = '#9ca3af';
const CAMP_COLOR = '#92400e';

const SKIP_V = new Set(['3,0', '1,10', '1,5', '3,5']); // col,row

function isRailH(row: number) { return [1, 5, 6, 10].includes(row); }
function isRailV(col: number, row: number) {
  if (col === 0 || col === 4) return row >= 1 && row <= 9;
  if (col === 2) return row === 5;
  return false;
}

// Deduplicated diagonal pairs
const DIAG_PAIRS: Array<[[number,number],[number,number]]> = (() => {
  const seen = new Set<string>();
  const pairs: Array<[[number,number],[number,number]]> = [];
  for (const pos of CAMP_POSITIONS) {
    const [r, c] = pos.split(',').map(Number);
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]) {
      const nr = r+dr, nc = c+dc;
      if (nr>=0 && nr<12 && nc>=0 && nc<5) {
        const pts = [[r,c],[nr,nc]].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        const k = pts.map(p=>p.join(',')).join('|');
        if (!seen.has(k)) { seen.add(k); pairs.push([[r,c],[nr,nc]]); }
      }
    }
  }
  return pairs;
})();

interface Props {
  gameState: GameState;
  myColor: Color | null;
  isMyTurn: boolean;
  phase: 'flipping' | 'playing';
  onFlip: (row: number, col: number) => void;
  onMove: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
}

export default function Board({ gameState, myColor, isMyTurn, phase, onFlip, onMove }: Props) {
  const [selected, setSelected] = useState<[number,number] | null>(null);
  const [validMoves, setValidMoves] = useState<Set<string>>(new Set());
  const board = gameState.board;

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!isMyTurn) return;
    const cell = board[row][col];

    if (phase === 'flipping') {
      if (cell.piece && !cell.piece.faceUp && !isCamp(row, col)) onFlip(row, col);
      return;
    }

    if (selected) {
      const [sr, sc] = selected;
      if (validMoves.has(`${row},${col}`)) {
        onMove(sr, sc, row, col);
        setSelected(null); setValidMoves(new Set());
        return;
      }
      setSelected(null); setValidMoves(new Set());
    }

    if (cell.piece?.faceUp && cell.piece.color === myColor) {
      const moves = getValidMoves(board, row, col, myColor!);
      setSelected([row, col]);
      setValidMoves(new Set(moves.map(([r,c]) => `${r},${c}`)));
    } else if (cell.piece && !cell.piece.faceUp && !isCamp(row, col)) {
      onFlip(row, col);
    }
  }, [board, isMyTurn, myColor, onFlip, onMove, phase, selected, validMoves]);

  const lines = useMemo(() => {
    const els: React.ReactNode[] = [];
    let k = 0;
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 4; c++) {
        const rail = isRailH(r);
        const [x1,y1,x2,y2] = [gx(c),gy(r),gx(c+1),gy(r)];
        if (rail) {
          // Two rails (top and bottom) with red-white alternating dash pattern
          els.push(<line key={k++} x1={x1} y1={y1-5} x2={x2} y2={y2-5} stroke="white" strokeWidth={3}/>);
          els.push(<line key={k++} x1={x1} y1={y1-5} x2={x2} y2={y2-5} stroke={RAIL_RED} strokeWidth={3} strokeDasharray="10,10"/>);
          els.push(<line key={k++} x1={x1} y1={y1+5} x2={x2} y2={y2+5} stroke="white" strokeWidth={3}/>);
          els.push(<line key={k++} x1={x1} y1={y1+5} x2={x2} y2={y2+5} stroke={RAIL_RED} strokeWidth={3} strokeDasharray="10,10"/>);
        } else {
          els.push(<line key={k++} x1={x1} y1={y1} x2={x2} y2={y2} stroke={REG_COLOR} strokeWidth={1.5}/>);
        }
      }
    }
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 11; r++) {
        if (SKIP_V.has(`${c},${r}`)) continue;
        const rail = isRailV(c, r);
        const [x1,y1,x2,y2] = [gx(c),gy(r),gx(c),gy(r+1)];
        if (rail) {
          // Two rails (left and right) with red-white alternating dash pattern
          els.push(<line key={k++} x1={x1-5} y1={y1} x2={x2-5} y2={y2} stroke="white" strokeWidth={3}/>);
          els.push(<line key={k++} x1={x1-5} y1={y1} x2={x2-5} y2={y2} stroke={RAIL_RED} strokeWidth={3} strokeDasharray="10,10"/>);
          els.push(<line key={k++} x1={x1+5} y1={y1} x2={x2+5} y2={y2} stroke="white" strokeWidth={3}/>);
          els.push(<line key={k++} x1={x1+5} y1={y1} x2={x2+5} y2={y2} stroke={RAIL_RED} strokeWidth={3} strokeDasharray="10,10"/>);
        } else {
          els.push(<line key={k++} x1={x1} y1={y1} x2={x2} y2={y2} stroke={REG_COLOR} strokeWidth={1.5}/>);
        }
      }
    }
    for (const [[r1,c1],[r2,c2]] of DIAG_PAIRS) {
      els.push(<line key={k++} x1={gx(c1)} y1={gy(r1)} x2={gx(c2)} y2={gy(r2)} stroke={REG_COLOR} strokeWidth={1.5}/>);
    }
    return els;
  }, []);

  const cells = useMemo(() => {
    const els: React.ReactNode[] = [];
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 5; c++) {
        const cx = gx(c), cy = gy(r);
        const cell = board[r][c];
        const piece = cell.piece;
        const isSelected = selected?.[0] === r && selected?.[1] === c;
        const isValidDest = validMoves.has(`${r},${c}`);
        const camp = isCamp(r, c);
        const hq = isHQ(r, c);

        if (camp) {
          els.push(<circle key={`cb-${r}-${c}`} cx={cx} cy={cy} r={22} fill="#fef3c7" stroke={CAMP_COLOR} strokeWidth={2}/>);
          if (!piece) els.push(<text key={`cl-${r}-${c}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={CAMP_COLOR} fontSize={10}>行营</text>);
        } else if (hq) {
          els.push(<rect key={`hb-${r}-${c}`} x={cx-22} y={cy-13} width={44} height={26} rx={5} fill="#fee2e2" stroke="#b91c1c" strokeWidth={1.5}/>);
          if (!piece) els.push(<text key={`hl-${r}-${c}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#b91c1c" fontSize={9}>大本营</text>);
        } else if (!piece) {
          els.push(<circle key={`dot-${r}-${c}`} cx={cx} cy={cy} r={4} fill={REG_COLOR}/>);
        }

        if (isValidDest && !piece) {
          els.push(<circle key={`vm-${r}-${c}`} cx={cx} cy={cy} r={11} fill="#f6e05e" opacity={0.75} onClick={() => handleCellClick(r,c)} style={{cursor:'pointer'}}/>);
        }

        if (piece) {
          const faceUp = piece.faceUp;
          const isRed = piece.color === 'red';
          const pFill = faceUp ? (isRed ? '#7f1d1d' : '#0c4a6e') : '#374151';
          const pStroke = isSelected ? '#fbbf24' : isValidDest ? '#fbbf24' : faceUp ? (isRed ? '#ef4444' : '#38bdf8') : '#6b7280';
          const pr = camp ? 19 : 18;

          if (isValidDest) {
            els.push(<circle key={`vc-${r}-${c}`} cx={cx} cy={cy} r={pr+5} fill="none" stroke="#fbbf24" strokeWidth={2.5} opacity={0.8} onClick={() => handleCellClick(r,c)} style={{cursor:'pointer'}}/>);
          }
          els.push(
            <g key={`p-${r}-${c}`} onClick={() => handleCellClick(r,c)} style={{cursor: isMyTurn ? 'pointer' : 'default'}}>
              <circle cx={cx} cy={cy} r={pr} fill={pFill} stroke={pStroke} strokeWidth={isSelected ? 3 : 2}
                transform={isSelected ? `translate(${cx*(1-1.1)},${cy*(1-1.1)}) scale(1.1)` : undefined}/>
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fill={faceUp ? (isRed ? '#fca5a5' : '#7dd3fc') : '#9ca3af'}
                fontSize={faceUp ? 11 : 14} fontWeight="bold">
                {faceUp ? RANK_LABELS[piece.rank] : '？'}
              </text>
            </g>
          );
        }
      }
    }
    return els;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, selected, validMoves, isMyTurn, myColor]);

  return (
    <div className="overflow-auto max-h-screen">
      <svg width={SVG_W} height={SVG_H} style={{background:'white', borderRadius:12, display:'block', border:'1px solid #e5e7eb'}}>
        <line x1={PAD/2} y1={(gy(5)+gy(6))/2} x2={SVG_W-PAD/2} y2={(gy(5)+gy(6))/2}
          stroke="#b91c1c" strokeWidth={1} strokeDasharray="6,4" opacity={0.6}/>
        <text x={SVG_W/2} y={(gy(5)+gy(6))/2} textAnchor="middle" dominantBaseline="middle"
          fill="#b91c1c" fontSize={11} opacity={0.8} letterSpacing={4}>前线</text>
        {lines}
        {cells}
      </svg>
    </div>
  );
}
