'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket-client';
import { Color, GameState, Room } from '@/types/game';
import Board from '@/components/Board';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faCheck, faStar, faSkull } from '@fortawesome/free-solid-svg-icons';

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Color | null>(null);
  const [winner, setWinner] = useState<Color | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('等待对手加入...');

  const socket = getSocket();

  useEffect(() => {
    // Request current state on mount (handles page refresh and player 2 redirect)
    socket.emit('get_room_state', code);

    socket.on('room_joined', (data) => {
      setRoom(data.room);
      if (data.yourColor) {
        setMyColor(data.yourColor);
        setMessage(data.yourColor === 'red' ? '你是红方' : '你是黑方');
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

    socket.on('color_assigned', (data) => {
      const myId = socket.id;
      if (!myId) return;
      const color: Color = data.red === myId ? 'red' : 'black';
      setMyColor(color);
      setMessage(color === 'red' ? '你是红方' : '你是黑方');
    });

    socket.on('turn_changed', (color) => {
      setCurrentTurn(color);
    });

    socket.on('game_over', (winnerColor) => {
      setWinner(winnerColor);
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
    };
  }, [socket]);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex flex-col items-center p-4 gap-4">
      {/* Header */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <h1 className="text-white font-bold text-xl tracking-widest">军棋</h1>
        <button
          onClick={copyCode}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors"
        >
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className={copied ? 'text-green-400' : ''} />
          <span className="font-mono tracking-widest">{code}</span>
        </button>
      </div>

      {/* Status bar */}
      <div className="w-full max-w-lg flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          {myColor && (
            <span className={`w-3 h-3 rounded-full ${myColor === 'red' ? 'bg-red-500' : 'bg-slate-400'}`} />
          )}
          <span className="text-slate-300 text-sm">{message}</span>
        </div>
        {currentTurn && (
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${
              isMyTurn ? 'bg-yellow-600 text-yellow-100' : 'bg-slate-700 text-slate-400'
            }`}>
              {isMyTurn ? '你的回合' : '对方回合'}
            </span>
          </div>
        )}
      </div>

      {/* Mine counters */}
      {gameState && myColor && (
        <div className="w-full max-w-lg flex justify-between text-xs text-slate-400 px-1">
          <span>对方地雷: {'💣'.repeat(myColor === 'red' ? gameState.blackMines : gameState.redMines)}</span>
          <span>我方地雷: {'💣'.repeat(myColor === 'red' ? gameState.redMines : gameState.blackMines)}</span>
        </div>
      )}

      {/* Board */}
      {gameState ? (
        <div className="bg-slate-900/80 rounded-2xl p-3 border border-slate-700">
          <Board
            gameState={gameState}
            myColor={myColor}
            isMyTurn={isMyTurn}
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
