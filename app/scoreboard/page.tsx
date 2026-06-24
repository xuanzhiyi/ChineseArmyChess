'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface LeaderboardEntry {
  username: string;
  wins: number;
  losses: number;
}

interface MatchEntry {
  redPlayer: string | null;
  blackPlayer: string | null;
  winner: string;
  date: string;
}

interface ScoreboardData {
  leaderboard: LeaderboardEntry[];
  matches: MatchEntry[];
  days: number;
}

export default function Scoreboard() {
  const router = useRouter();
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/scoreboard?days=${days}`)
      .then(r => r.json() as Promise<ScoreboardData>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('加载失败'); setLoading(false); });
  }, [days]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 p-4">
      <div className="max-w-lg mx-auto space-y-6 pt-4">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold text-white flex-1">排行榜</h1>
          <div className="flex gap-1">
            {[3, 7, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors
                  ${days === d ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-slate-400 text-center py-8">加载中...</p>}
        {error && <p className="text-red-400 text-center py-8">{error}</p>}

        {data && (
          <>
            {/* Leaderboard */}
            <div className="bg-slate-800/60 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h2 className="text-white font-semibold">过去{data.days}天排名</h2>
              </div>
              {data.leaderboard.length === 0 ? (
                <p className="text-slate-500 text-center py-6 text-sm">暂无数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs">
                      <th className="text-left px-4 py-2">名次</th>
                      <th className="text-left px-4 py-2">用户名</th>
                      <th className="text-center px-4 py-2 text-green-400">胜</th>
                      <th className="text-center px-4 py-2 text-red-400">负</th>
                      <th className="text-center px-4 py-2">胜率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaderboard.map((e, i) => {
                      const total = e.wins + e.losses;
                      const rate = total > 0 ? Math.round(e.wins / total * 100) : 0;
                      return (
                        <tr key={e.username} className="border-t border-slate-700/50">
                          <td className="px-4 py-3 text-slate-400">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </td>
                          <td className="px-4 py-3 text-white font-semibold">{e.username}</td>
                          <td className="px-4 py-3 text-center text-green-400 font-semibold">{e.wins}</td>
                          <td className="px-4 py-3 text-center text-red-400">{e.losses}</td>
                          <td className="px-4 py-3 text-center text-slate-300">{rate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent matches */}
            {data.matches.length > 0 && (
              <div className="bg-slate-800/60 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700">
                  <h2 className="text-white font-semibold">最近对局</h2>
                </div>
                <div className="divide-y divide-slate-700/50">
                  {data.matches.map((m, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3 text-sm">
                      <span className="text-slate-500 text-xs w-24 shrink-0">{formatDate(m.date)}</span>
                      <span className={`font-semibold ${m.winner === 'red' ? 'text-red-400' : 'text-slate-400'}`}>
                        {m.redPlayer ?? '匿名'}
                      </span>
                      <span className="text-slate-600 text-xs">vs</span>
                      <span className={`font-semibold ${m.winner === 'black' ? 'text-slate-200' : 'text-slate-400'}`}>
                        {m.blackPlayer ?? '匿名'}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        {m.winner === 'red' ? (m.redPlayer ?? '红方') : (m.blackPlayer ?? '黑方')}胜
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
