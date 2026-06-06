/* ===========================================================
   UI 基础组件 + 五边形雷达图
   =========================================================== */
import { useState, useEffect } from 'react';
import { useData } from '../data/store.jsx';
import leafIcon from '../assets/img/icons/icon-leaf.png';

/* ---------- 国旗圆形徽章 (emoji 旗帜) ---------- */
export function FlagBadge({ code, size = 46 }) {
  const { byCode } = useData();
  const t = byCode?.[code];
  return (
    <div
      className="flag"
      style={{
        width: size,
        height: size,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
      }}
    >
      {t?.flagEmoji || <span className="code" style={{ position: 'static', fontSize: size * 0.26 }}>{code}</span>}
    </div>
  );
}

/* ---------- 数据条 ---------- */
export function StatBar({ label, value, max = 99, color }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW((value / max) * 100)); return () => cancelAnimationFrame(id); }, [value, max]);
  return (
    <div className="statrow">
      <div className="lbl">{label}</div>
      <div className="track">
        <div className="fill" style={{ width: w + '%', background: color || undefined }} />
      </div>
      <div className="val">{value}</div>
    </div>
  );
}

/* ---------- 胜/平/负 概率条 ---------- */
export function ProbBar({ win, draw, loss }) {
  return (
    <div className="probbar">
      <div className="pw" style={{ width: win + '%' }}>{win}%</div>
      <div className="pd" style={{ width: draw + '%' }}>{draw}%</div>
      <div className="pl" style={{ width: loss + '%' }}>{loss}%</div>
    </div>
  );
}

/* ---------- 近期战绩点 ---------- */
export function FormDots({ form }) {
  const map = { W: ['#6fba2c', '胜'], D: ['#f5c31c', '平'], L: ['#e05a5a', '负'] };
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {form.map((r, i) => (
        <span key={i} style={{
          width: 20, height: 20, borderRadius: '50%', background: map[r][0], color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 900,
        }}>{map[r][1]}</span>
      ))}
    </div>
  );
}

/* ---------- 五边形雷达图 ---------- */
export function Radar({ stats, size = 250, color = '#19c8b9', accent }) {
  const keys = Object.keys(stats);
  const n = keys.length;
  const cx = size / 2, cy = size / 2;
  const R = size * 0.34;
  const labelR = R + 26;
  const rings = [0.25, 0.5, 0.75, 1];
  const [grow, setGrow] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(1)); return () => cancelAnimationFrame(id); }, [stats]);

  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];

  const ringPoly = (r) => keys.map((_, i) => pt(i, r).join(',')).join(' ');
  const valuePoly = keys.map((k, i) => pt(i, (stats[k] / 100) * grow).join(',')).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* 网格环 */}
      {rings.map((r, idx) => (
        <polygon key={idx} points={ringPoly(r)} fill={idx === rings.length - 1 ? '#f3ecd9' : 'none'}
          stroke="#d9cead" strokeWidth="2" />
      ))}
      {/* 轴线 */}
      {keys.map((k, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#d9cead" strokeWidth="2" />;
      })}
      {/* 数值多边形 */}
      <polygon points={valuePoly} fill={color} fillOpacity="0.32" stroke={color} strokeWidth="3"
        strokeLinejoin="round" style={{ transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
      {/* 顶点 */}
      {keys.map((k, i) => {
        const [x, y] = pt(i, (stats[k] / 100) * grow);
        return <circle key={i} cx={x} cy={y} r="4.5" fill="#fff" stroke={color} strokeWidth="3"
          style={{ transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1)' }} />;
      })}
      {/* 标签 + 数值 */}
      {keys.map((k, i) => {
        const lx = cx + Math.cos(ang(i)) * labelR;
        const ly = cy + Math.sin(ang(i)) * labelR;
        return (
          <g key={i}>
            <text x={lx} y={ly - 4} textAnchor="middle" fontSize="13" fontWeight="800" fill="#794f27"
              fontFamily="var(--font)">{k}</text>
            <text x={lx} y={ly + 13} textAnchor="middle" fontSize="14" fontWeight="900" fill={accent || color}
              fontFamily="var(--font)">{stats[k]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 历史交锋 对阵图 ---------- */
export function H2HChart({ home, away, h2h, recent = [], real = false, compLabel = (c) => c }) {
  const total = h2h.total || h2h.aw + h2h.dr + h2h.bw || 0;
  const [grow, setGrow] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setGrow(1)); return () => cancelAnimationFrame(id); }, [h2h]);
  const pct = (n) => (total ? (n / total) * 100 * grow : 0);

  // 胜负配色
  const C = { home: '#19c8b9', draw: '#f5c31c', away: '#e05a5a' };
  const resultOf = (m) => (m.homeGoals > m.awayGoals ? 'home' : m.homeGoals === m.awayGoals ? 'draw' : 'away');

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* 对阵头 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 78 }}>
          <FlagBadge code={home.code} size={44} />
          <span style={{ fontWeight: 900, fontSize: 12, color: C.home, textAlign: 'center' }}>{home.name}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 40, height: 40, transform: 'rotate(45deg)', borderRadius: 11,
            background: 'linear-gradient(135deg,#fff,#f3ecd9)', border: '2.5px solid #d9cead',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ transform: 'rotate(-45deg)', fontSize: 13, fontWeight: 900, color: '#9f927d' }}>VS</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d' }}>{real ? `${total} 次交锋` : '暂无真实交锋'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 78 }}>
          <FlagBadge code={away.code} size={44} />
          <span style={{ fontWeight: 900, fontSize: 12, color: C.away, textAlign: 'center' }}>{away.name}</span>
        </div>
      </div>

      {/* 拔河平衡条 */}
      <div style={{
        display: 'flex', height: 30, borderRadius: 15, overflow: 'hidden',
        background: '#efe7d4', border: '2px solid #e6ddc6', boxShadow: 'inset 0 1px 3px rgba(107,92,67,0.12)',
      }}>
        {[['home', h2h.aw], ['draw', h2h.dr], ['away', h2h.bw]].map(([k, n]) => (
          <div key={k} style={{
            width: pct(n) + '%', background: C[k], display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 900, overflow: 'hidden',
            transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)', whiteSpace: 'nowrap',
          }}>{n > 0 && pct(n) > 8 ? n : ''}</div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.home }}>{home.name}胜 {h2h.aw}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#a07e08' }}>平 {h2h.dr}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.away }}>{away.name}胜 {h2h.bw}</span>
      </div>

      {/* 交锋时间线 */}
      {real && recent.length > 0 && (
        <div style={{ borderTop: '2px dashed #e6ddc6', marginTop: 14, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recent.map((m, i) => {
            const r = resultOf(m);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', width: 62, flex: 'none' }}>{m.date}</span>
                <div style={{
                  flex: 'none', minWidth: 64, padding: '3px 12px', borderRadius: 11, textAlign: 'center',
                  background: C[r], color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: '0.03em',
                  boxShadow: `0 2px 0 0 ${r === 'home' ? '#11a89b' : r === 'draw' ? '#dba90e' : '#c94444'}`,
                }}>{m.homeGoals} - {m.awayGoals}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#725d42', flex: 1 }}>
                  {r === 'draw' ? '战平' : `${r === 'home' ? home.name : away.name}胜`}
                </span>
                <span className="chip" style={{ flex: 'none', fontSize: 10, padding: '2px 8px' }}>{compLabel(m.competition)}</span>
              </div>
            );
          })}
          {total > recent.length && (
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9f927d', textAlign: 'center', marginTop: 2 }}>仅显示最近 {recent.length} 场 · 共 {total} 场交锋</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- 赔率走势迷你折线图 (纯 SVG) ---------- */
export function Sparkline({ series, height = 64 }) {
  if (!series?.length || !series[0].data?.length) return null;
  const maxLen = Math.max(...series.map((s) => s.data.length));
  if (maxLen < 2) return null;

  const pad = { top: 6, bottom: 6, left: 4, right: 4 };
  const W = 280;
  const H = height;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const allVals = series.flatMap((s) => s.data);
  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const range = hi - lo || 1;

  const toPath = (data) => {
    const step = plotW / (maxLen - 1);
    return data.map((v, i) => {
      const x = pad.left + i * step;
      const y = pad.top + plotH - ((v - lo) / range) * plotH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  };

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ display: 'block', borderRadius: 10, background: '#faf6ee' }}>
      {series.map((s, i) => (
        <polyline key={i} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round"
          strokeLinejoin="round" points={s.data.map((v, j) => {
            const x = pad.left + j * (plotW / (maxLen - 1));
            const y = pad.top + plotH - ((v - lo) / range) * plotH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ')} />
      ))}
      {series.map((s, i) => {
        const last = s.data[s.data.length - 1];
        const x = pad.left + (s.data.length - 1) * (plotW / (maxLen - 1));
        const y = pad.top + plotH - ((last - lo) / range) * plotH;
        return <circle key={`d${i}`} cx={x} cy={y} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />;
      })}
    </svg>
  );
}

/* ---------- 区块标题 ---------- */
export function SecH({ children }) {
  return (
    <div className="sec-h">
      <img className="leaf" src={leafIcon} alt="" />
      {children}
    </div>
  );
}

/* ---------- 顶部应用栏 ---------- */
export function Header({ title, sub, onBack }) {
  return (
    <div className="app-header">
      {onBack && <button className="back" onClick={onBack}>‹</button>}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------- 预测对比面板 ---------- */
export function ComparisonPanel({ baseline, prediction, marketOdds, homeName, awayName }) {
  const outcome = (o) => (o.win > o.loss ? 'home' : o.loss > o.win ? 'away' : 'draw');
  const eloOdds = baseline?.odds;
  const aiOdds = prediction?.engine === 'ai' ? { win: prediction.win, draw: prediction.draw, loss: prediction.loss } : null;
  const mktOdds = marketOdds?.implied || null;

  const sources = [eloOdds, aiOdds, mktOdds].filter(Boolean);
  const outcomes = sources.map(outcome);
  const hasDisagreement = new Set(outcomes).size > 1;

  const colStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, padding: '0 4px' };
  const numStyle = (color) => ({ fontSize: 18, fontWeight: 900, color, lineHeight: 1 });
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#9f927d' };
  const headerStyle = { fontSize: 11, fontWeight: 900, color: '#725d42', marginBottom: 4, textAlign: 'center' };
  const disabledStyle = { opacity: 0.35 };

  const renderCol = (odds, header, disabled) => (
    <div style={{ ...colStyle, ...(disabled ? disabledStyle : {}) }}>
      <div style={headerStyle}>{header}</div>
      {odds ? (
        <>
          <span style={numStyle('#11a89b')}>{odds.win}%</span>
          <span style={labelStyle}>{homeName}胜</span>
          <span style={numStyle('#a07e08')}>{odds.draw}%</span>
          <span style={labelStyle}>平</span>
          <span style={numStyle('#e05a5a')}>{odds.loss}%</span>
          <span style={labelStyle}>{awayName}胜</span>
        </>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c4b89e', marginTop: 12 }}>{disabled === 'ai' ? '未加载' : '暂无赔率'}</span>
      )}
    </div>
  );

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 900, fontSize: 13, color: '#794f27' }}>多维对比</span>
        {hasDisagreement && <span className="chip yellow" style={{ fontSize: 10 }}>⚠ 模型分歧</span>}
      </div>
      <div style={{ display: 'flex', borderTop: '2px dashed #e6ddc6', paddingTop: 10 }}>
        {renderCol(eloOdds, '📊 Elo', false)}
        <div style={{ width: 1, background: '#e6ddc6', margin: '0 2px' }} />
        {renderCol(aiOdds, '🤖 AI', aiOdds ? false : 'ai')}
        <div style={{ width: 1, background: '#e6ddc6', margin: '0 2px' }} />
        {renderCol(mktOdds, '📈 市场', mktOdds ? false : 'market')}
      </div>
    </div>
  );
}

/* 综合评分徽章 */
export function OvrBadge({ value, label = '综合' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 54, height: 54, flex: 'none', borderRadius: '50%',
      background: 'linear-gradient(180deg,#fff,#f8f8f0)', border: '2.5px solid #19c8b9',
      boxShadow: '0 3px 0 0 #11a89b',
    }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: '#11a89b', lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, fontWeight: 800, color: '#9f927d', marginTop: 1 }}>{label}</span>
    </div>
  );
}
