/* ===========================================================
   UI 基础组件 + 五边形雷达图
   导出到 window
   =========================================================== */
const { useState, useEffect, useRef } = React;

/* ---------- 国旗圆形徽章 ---------- */
function FlagBadge({ code, size = 46 }) {
  const t = window.WC.byCode[code];
  if (!t) return null;
  return (
    <div className="flag" style={{ width: size, height: size, background: t.flag, backgroundColor: '#ddd' }}>
      <span className="code">{code}</span>
    </div>
  );
}

/* ---------- 数据条 ---------- */
function StatBar({ label, value, max = 99, color }) {
  const [w, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setW((value / max) * 100)); return () => cancelAnimationFrame(id); }, [value]);
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
function ProbBar({ win, draw, loss }) {
  return (
    <div className="probbar">
      <div className="pw" style={{ width: win + '%' }}>{win}%</div>
      <div className="pd" style={{ width: draw + '%' }}>{draw}%</div>
      <div className="pl" style={{ width: loss + '%' }}>{loss}%</div>
    </div>
  );
}

/* ---------- 近期战绩点 ---------- */
function FormDots({ form }) {
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
function Radar({ stats, size = 250, color = '#19c8b9', accent }) {
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

/* ---------- 区块标题 ---------- */
function SecH({ children }) {
  return (
    <div className="sec-h">
      <img className="leaf" src="src/assets/img/icons/icon-leaf.png" alt="" />
      {children}
    </div>
  );
}

/* ---------- 顶部应用栏 ---------- */
function Header({ title, sub, onBack }) {
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

/* 综合评分徽章 */
function OvrBadge({ value, label = '综合' }) {
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

Object.assign(window, { FlagBadge, StatBar, ProbBar, FormDots, Radar, SecH, Header, OvrBadge });
