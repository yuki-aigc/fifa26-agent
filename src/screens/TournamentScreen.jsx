import { useState, useEffect } from 'react';
import { api } from '../data/api.js';
import { FlagBadge, SecH } from '../components/ui.jsx';

const STAGES = ['qualify', 'roundOf32', 'roundOf16', 'quarterFinal', 'semiFinal', 'final', 'champion'];
const STAGE_LABELS = ['出线', '32强', '16强', '8强', '4强', '决赛', '夺冠'];

function ProbCell({ value }) {
  const alpha = Math.min(1, value / 100);
  const bg = `rgba(25, 200, 185, ${alpha * 0.6})`;
  return (
    <td style={{
      padding: '5px 2px', textAlign: 'center', fontSize: 11, fontWeight: 800,
      color: value > 50 ? '#fff' : value > 10 ? '#725d42' : '#c4b89e',
      background: bg, borderRadius: 4,
    }}>
      {value > 0 ? `${value}%` : '-'}
    </td>
  );
}

export function TournamentScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api.tournamentSimulation()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="screen pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ fontSize: 44 }}>🎲</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#9f927d' }}>模拟 10000 次锦标赛中…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="screen pop">
        <div className="card" style={{ textAlign: 'center', padding: 30, color: '#e05a5a', fontWeight: 800 }}>模拟失败: {err}</div>
      </div>
    );
  }

  if (!data) return null;

  const top10 = data.teams.slice(0, 10);
  const maxChamp = top10[0]?.champion || 1;

  const groups = {};
  for (const t of data.teams) {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  }
  const sortedGroupKeys = Object.keys(groups).sort();

  return (
    <div className="screen pop">
      {/* 夺冠概率 Top 10 */}
      <SecH>夺冠概率</SecH>
      <div className="card" style={{ padding: 14 }}>
        {top10.map((t, i) => (
          <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < top10.length - 1 ? '1px solid #ece3cf' : 'none' }}>
            <span style={{ width: 20, fontSize: 12, fontWeight: 900, color: i < 3 ? '#f5c31c' : '#c4b89e', textAlign: 'center' }}>{i + 1}</span>
            <FlagBadge code={t.code} size={32} />
            <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', width: 60 }}>{t.name}</span>
            <div style={{ flex: 1, height: 14, background: '#ece3cf', borderRadius: 50, overflow: 'hidden' }}>
              <div style={{
                width: `${(t.champion / maxChamp) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #19c8b9, #11a89b)',
                borderRadius: 50,
                transition: 'width .7s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            <span style={{ width: 48, textAlign: 'right', fontWeight: 900, fontSize: 14, color: '#11a89b' }}>{t.champion}%</span>
          </div>
        ))}
      </div>

      {/* 各组出线预测 */}
      <SecH>各组出线预测</SecH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sortedGroupKeys.map((g) => (
          <div key={g} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: '#794f27', marginBottom: 8, textAlign: 'center' }}>{g}组</div>
            {groups[g]
              .sort((a, b) => b.qualify - a.qualify)
              .map((t, i) => (
                <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <FlagBadge code={t.code} size={24} />
                  <span style={{ flex: 1, fontWeight: 800, fontSize: 12, color: '#794f27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ fontWeight: 900, fontSize: 12, color: t.qualify > 50 ? '#11a89b' : '#c4b89e' }}>{t.qualify}%</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* 晋级概率矩阵 */}
      <SecH>晋级概率矩阵</SecH>
      <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', textAlign: 'left', padding: '4px 2px' }}>球队</th>
              {STAGE_LABELS.map((l) => (
                <th key={l} style={{ fontSize: 9, fontWeight: 800, color: '#9f927d', textAlign: 'center', padding: '4px 1px' }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.teams.slice(0, 32).map((t) => (
              <tr key={t.code}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 2px', whiteSpace: 'nowrap' }}>
                  <FlagBadge code={t.code} size={18} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#794f27' }}>{t.name}</span>
                </td>
                {STAGES.map((s) => <ProbCell key={s} value={t[s]} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: 8, marginBottom: 16 }}>
        基于 Elo 模型 · {data.iterations.toLocaleString()} 次蒙特卡洛模拟
      </div>
    </div>
  );
}
