'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket-client';
import { getPlayerToken } from '@/lib/player-token';
import { IconChessBoard, IconDoorOpen, IconDoorClosed, IconKey } from '@/components/icons';

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);
  const [myRooms, setMyRooms] = useState<Array<{ code: string; updatedAt: string }>>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('room_joined', (data) => router.push(`/room/${data.room.code}`));
    socket.on('error', (msg) => { setError(msg); setLoading(null); });
    socket.on('my_rooms', setMyRooms);

    const token = getPlayerToken();
    const fetchRooms = () => { if (token) socket.emit('get_my_rooms', token); };
    if (socket.connected) fetchRooms();
    else socket.once('connect', fetchRooms);

    return () => { socket.off('room_joined'); socket.off('error'); socket.off('my_rooms'); };
  }, [router]);

  function handleCreate() {
    setError(''); setLoading('create');
    getSocket().emit('create_room', getPlayerToken());
  }

  function handleJoin() {
    if (joinCode.trim().length !== 5) { setError('请输入5位房间码'); return; }
    setError(''); setLoading('join');
    getSocket().emit('join_room', joinCode.trim().toUpperCase(), getPlayerToken());
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <IconChessBoard className="text-red-400 text-5xl" />
          <h1 className="text-4xl font-bold text-white tracking-widest">军棋</h1>
          <p className="text-slate-400 text-sm">暗棋对战</p>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading !== null}
          className="w-full flex items-center justify-center gap-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
        >
          <IconDoorOpen />
          {loading === 'create' ? '创建中...' : '创建房间'}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-500 text-sm">或者</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <div className="space-y-3">
          <div className="relative">
            <IconKey className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="输入5位房间码"
              maxLength={5}
              className="w-full bg-slate-800 border border-slate-600 text-white placeholder-slate-500 pl-11 pr-4 py-4 rounded-xl focus:outline-none focus:border-red-500 text-center tracking-widest text-lg uppercase"
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            <IconDoorClosed />
            {loading === 'join' ? '加入中...' : '加入房间'}
          </button>
        </div>

        {myRooms.length > 0 && (
          <div className="space-y-2">
            <p className="text-slate-500 text-xs text-center">未完成的对局</p>
            {myRooms.map(r => (
              <button
                key={r.code}
                onClick={() => router.push(`/room/${r.code}`)}
                className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 px-4 py-3 rounded-xl transition-colors"
              >
                <span className="font-mono tracking-widest text-white">{r.code}</span>
                <span className="text-slate-500 text-xs">
                  {new Date(r.updatedAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-center text-sm">{error}</p>}
      </div>
    </main>
  );
}
