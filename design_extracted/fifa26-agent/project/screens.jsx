/* ===========================================================
   屏幕: 赛程 / 单场预测 / 球队 / 球队详情 / 球员 / 球员详情
   (useState/useEffect 复用 ui.jsx 中的全局)
   =========================================================== */

/* 比较行 (双向对比条) */
function CompareRow({ f }) {
  const total = f.pa + f.pb || 1;
  const lp = (f.pa / total) * 100;
  const rp = (f.pb / total) * 100;
  const lead = f.lead;
  return (
    <div style={{ margin: '11px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontWeight: 900, fontSize: 14, color: lead === 1 ? '#11a89b' : '#9f927d', width: 44 }}>{f.a}</span>
        <span style={{ fontWeight: 800, fontSize: 12, color: '#8a7b66' }}>{f.label}</span>
        <span style={{ fontWeight: 900, fontSize: 14, color: lead === -1 ? '#e05a5a' : '#9f927d', width: 44, textAlign: 'right' }}>{f.b}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, height: 9 }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', background: '#ece3cf', borderRadius: '50px 0 0 50px', overflow: 'hidden' }}>
          <div style={{ width: lp + '%', background: lead === 1 ? '#19c8b9' : '#d8cba6', borderRadius: '50px 0 0 50px', transition: 'width .7s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', background: '#ece3cf', borderRadius: '0 50px 50px 0', overflow: 'hidden' }}>
          <div style={{ width: rp + '%', background: lead === -1 ? '#e05a5a' : '#d8cba6', borderRadius: '0 50px 50px 0', transition: 'width .7s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- 赛程列表 ---------------- */
function MatchesScreen({ onOpenMatch }) {
  const { matches, byCode, odds } = window.WC;
  return (
    <div className="screen pop">
      <SecH>今日焦点</SecH>
      {(() => {
        const m = matches.find((x) => x.live) || matches[0];
        const o = odds(m.a, m.b);
        const A = byCode[m.a], B = byCode[m.b];
        const fav = o.win >= o.loss ? A : B;
        const favp = Math.max(o.win, o.loss);
        return (
          <div className="card press" onClick={() => onOpenMatch(m)}
            style={{ background: 'linear-gradient(160deg,#1fcabb,#11a89b)', border: 'none', color: '#fff', boxShadow: '0 6px 0 0 #0d8b80, 0 10px 20px rgba(17,168,155,.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span className="chip" style={{ background: 'rgba(255,255,255,.22)', color: '#fff', border: 'none' }}>{m.stage}</span>
              {m.live
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 900, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc00', boxShadow: '0 0 0 3px rgba(255,204,0,.4)' }} />进行中</span>
                : <span style={{ fontWeight: 800, fontSize: 12, opacity: .9 }}>{m.day} {m.time}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 96 }}>
                <FlagBadge code={m.a} size={56} />
                <span style={{ fontWeight: 900, fontSize: 15 }}>{A.name}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 800, opacity: .85, marginBottom: 2 }}>预测胜率</div>
                <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{favp}<span style={{ fontSize: 18 }}>%</span></div>
                <div style={{ fontSize: 11, fontWeight: 800, opacity: .9, marginTop: 2 }}>{fav.name}领先</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 96 }}>
                <FlagBadge code={m.b} size={56} />
                <span style={{ fontWeight: 900, fontSize: 15 }}>{B.name}</span>
              </div>
            </div>
            <div className="btn btn-block" style={{ marginTop: 16, background: '#ffcc00', color: '#725d42', boxShadow: '0 5px 0 0 #e0b800', height: 42 }}>查看完整预测 ›</div>
          </div>
        );
      })()}

      <SecH>全部赛程</SecH>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {matches.map((m) => {
          const o = odds(m.a, m.b);
          const A = byCode[m.a], B = byCode[m.b];
          return (
            <div key={m.id} className="card press" onClick={() => onOpenMatch(m)} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                <span className="chip">{m.stage}</span>
                <span style={{ fontWeight: 800, fontSize: 11.5, color: '#9f927d' }}>{m.day} · {m.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FlagBadge code={m.a} size={40} />
                <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27', flex: 1 }}>{A.name}</span>
                <span style={{ fontWeight: 800, fontSize: 12, color: '#c4b89e' }}>VS</span>
                <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27', flex: 1, textAlign: 'right' }}>{B.name}</span>
                <FlagBadge code={m.b} size={40} />
              </div>
              <div style={{ marginTop: 11 }}>
                <ProbBar win={o.win} draw={o.draw} loss={o.loss} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10.5, fontWeight: 800, color: '#9f927d' }}>
                  <span>胜 {o.win}%</span><span>平 {o.draw}%</span><span>负 {o.loss}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 单场预测详情 ---------------- */
function MatchDetailScreen({ match, onOpenTeam }) {
  const { byCode, odds, score, h2h, factors } = window.WC;
  const A = byCode[match.a], B = byCode[match.b];
  const o = odds(match.a, match.b);
  const s = score(match.a, match.b);
  const h = h2h(match.a, match.b);
  const fs = factors(match.a, match.b);
  const conf = Math.max(o.win, o.draw, o.loss);
  const result = o.win > o.loss ? `${A.name}胜` : o.loss > o.win ? `${B.name}胜` : '势均力敌';

  return (
    <div className="screen pop">
      {/* 对阵卡 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="press" onClick={() => onOpenTeam(match.a)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 90 }}>
            <FlagBadge code={match.a} size={62} />
            <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{A.name}</span>
            <span className="chip mint" style={{ padding: '2px 9px' }}>实力 {A.ovr}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>预测比分</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#794f27', lineHeight: 1.1, letterSpacing: '0.04em' }}>{s.a}<span style={{ color: '#c4b89e', margin: '0 4px' }}>:</span>{s.b}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>预期进球 {s.xgA} - {s.xgB}</div>
          </div>
          <div className="press" onClick={() => onOpenTeam(match.b)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 90 }}>
            <FlagBadge code={match.b} size={62} />
            <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{B.name}</span>
            <span className="chip mint" style={{ padding: '2px 9px' }}>实力 {B.ovr}</span>
          </div>
        </div>
      </div>

      {/* 胜率预测 */}
      <SecH>胜率预测</SecH>
      <div className="card">
        <ProbBar win={o.win} draw={o.draw} loss={o.loss} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#11a89b' }}>{o.win}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{A.name}胜</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#a07e08' }}>{o.draw}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>平局</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#e05a5a' }}>{o.loss}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{B.name}胜</div></div>
        </div>
        <div style={{ marginTop: 14, padding: '12px 14px', background: '#fff', borderRadius: 16, border: '2px dashed #e6ddc6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="chip green" style={{ flex: 'none' }}>模型判断</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#725d42' }}>看好 <b style={{ color: '#11a89b' }}>{result}</b>,置信度 {conf}%</span>
        </div>
      </div>

      {/* 关键因素 */}
      <SecH>实力对比</SecH>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 900, fontSize: 13 }}>
          <span style={{ color: '#794f27' }}>{A.name}</span>
          <span style={{ color: '#794f27' }}>{B.name}</span>
        </div>
        {fs.map((f, i) => <CompareRow key={i} f={f} />)}
      </div>

      {/* 历史交锋 */}
      <SecH>历史交锋</SecH>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div style={{ fontSize: 26, fontWeight: 900, color: '#11a89b' }}>{h.aw}</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{A.name}胜</div></div>
        <div style={{ width: 2, height: 36, background: '#e6ddc6' }} />
        <div><div style={{ fontSize: 26, fontWeight: 900, color: '#a07e08' }}>{h.dr}</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>平</div></div>
        <div style={{ width: 2, height: 36, background: '#e6ddc6' }} />
        <div><div style={{ fontSize: 26, fontWeight: 900, color: '#e05a5a' }}>{h.bw}</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{B.name}胜</div></div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenTeam(match.a)}>{A.name}数据</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenTeam(match.b)}>{B.name}数据</button>
      </div>
    </div>
  );
}

/* ---------------- 球队列表 ---------------- */
function TeamsScreen({ onOpenTeam }) {
  const { teams } = window.WC;
  const sorted = [...teams].sort((a, b) => b.ovr - a.ovr);
  return (
    <div className="screen pop">
      <SecH>球队实力榜</SecH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {sorted.map((t, i) => (
          <div key={t.code} className="card press" onClick={() => onOpenTeam(t.code)} style={{ padding: 14, textAlign: 'center', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 10, left: 12, fontSize: 11, fontWeight: 900, color: i < 3 ? '#f5c31c' : '#c4b89e' }}>#{i + 1}</span>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 9 }}><FlagBadge code={t.code} size={50} /></div>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{t.name}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9f927d', marginBottom: 9, height: 14, overflow: 'hidden' }}>{t.note}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#11a89b' }}>{t.ovr}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d' }}>综合</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}><FormDots form={t.form} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 球队详情 ---------------- */
function TeamDetailScreen({ code, onOpenPlayer }) {
  const t = window.WC.byCode[code];
  return (
    <div className="screen pop">
      <div className="card" style={{ textAlign: 'center', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><FlagBadge code={code} size={72} /></div>
        <div style={{ fontWeight: 900, fontSize: 22, color: '#794f27' }}>{t.name}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginBottom: 12 }}>{t.note}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
          <span className="chip">世界排名 #{t.rank}</span>
          <span className="chip yellow">★ {t.titles} 冠</span>
          <span className="chip mint">综合 {t.ovr}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>近5场</span>
          <FormDots form={t.form} />
        </div>
      </div>

      <SecH>球队数据</SecH>
      <div className="card">
        <StatBar label="进攻" value={t.att} />
        <StatBar label="中场" value={t.mid} />
        <StatBar label="防守" value={t.def} />
        <StatBar label="综合" value={t.ovr} color="linear-gradient(90deg,#f5c31c,#ffcc00)" />
      </div>

      <SecH>球员阵容</SecH>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {t.squad.map((pl, i) => (
          <div key={i} className="card press" onClick={() => onOpenPlayer(code, i)} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: t.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, boxShadow: '0 3px 0 0 rgba(0,0,0,.12)' }}>{pl.num}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{pl.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{pl.pos} · {pl.club}</div>
            </div>
            <OvrBadge value={pl.ovr} />
            <span style={{ fontSize: 22, color: '#c4b89e', fontWeight: 900 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 球员列表 ---------------- */
function PlayersScreen({ onOpenPlayer }) {
  const { teams } = window.WC;
  const [filter, setFilter] = useState('全部');
  const posMap = { 前锋: 'FW', 中场: 'MF', 后卫: 'DF', 门将: 'GK' };
  const all = [];
  teams.forEach((t) => t.squad.forEach((pl, i) => all.push({ ...pl, team: t.code, idx: i, accent: t.accent })));
  let list = all;
  if (filter !== '全部') list = all.filter((pl) => pl.pos === posMap[filter]);
  list = list.sort((a, b) => b.ovr - a.ovr);
  const tabs = ['全部', '前锋', '中场', '后卫', '门将'];
  return (
    <div className="screen pop">
      <SecH>球星数据库</SecH>
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map((tb) => (
          <button key={tb} onClick={() => setFilter(tb)} className="chip" style={{
            cursor: 'pointer', border: 'none',
            background: filter === tb ? '#19c8b9' : '#fff',
            color: filter === tb ? '#fff' : '#8a7b66',
            boxShadow: filter === tb ? '0 3px 0 0 #11a89b' : '0 2px 0 0 #e6ddc6',
            padding: '7px 15px',
          }}>{tb}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((pl) => (
          <div key={pl.team + pl.idx} className="card press" onClick={() => onOpenPlayer(pl.team, pl.idx)} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
            <FlagBadge code={pl.team} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{pl.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{window.WC.byCode[pl.team].name} · {pl.pos} · {pl.age}岁</div>
            </div>
            <OvrBadge value={pl.ovr} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 球员详情 (五边形) ---------------- */
function PlayerDetailScreen({ code, idx }) {
  const t = window.WC.byCode[code];
  const pl = t.squad[idx];
  const entries = Object.entries(pl.radar);
  const top = [...entries].sort((a, b) => b[1] - a[1]);
  const trait = `擅长${top[0][0]}与${top[1][0]}`;
  return (
    <div className="screen pop">
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <FlagBadge code={code} size={50} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 21, color: '#794f27', lineHeight: 1.1 }}>{pl.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginTop: 3 }}>{t.name} · {pl.pos} · {pl.num}号</div>
          </div>
          <OvrBadge value={pl.ovr} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span className="chip">{pl.age}岁</span>
          <span className="chip mint" style={{ flex: 1, justifyContent: 'center' }}>{pl.club}</span>
        </div>
      </div>

      <SecH>能力雷达</SecH>
      <div className="card" style={{ paddingBottom: 8 }}>
        <div className="radar-wrap">
          <Radar stats={pl.radar} size={258} color="#19c8b9" accent={t.accent} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 2 }}>
          <span className="chip green">{trait}</span>
        </div>
      </div>

      <SecH>属性明细</SecH>
      <div className="card">
        {entries.map(([k, v]) => <StatBar key={k} label={k} value={v} />)}
      </div>
    </div>
  );
}

Object.assign(window, { MatchesScreen, MatchDetailScreen, TeamsScreen, TeamDetailScreen, PlayersScreen, PlayerDetailScreen });
