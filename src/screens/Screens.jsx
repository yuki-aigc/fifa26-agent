/* ===========================================================
   屏幕: 赛程 / 单场预测 / 球队 / 球队详情 / 球员 / 球员详情
   数据来自后端 API (useData);单场预测直接调用后端 /prediction 接口。
   =========================================================== */
import { useState, useEffect, useRef } from 'react';
import { useData } from '../data/store.jsx';
import { api } from '../data/api.js';
import { odds } from '../data/elo.js';
import { FlagBadge, StatBar, ProbBar, FormDots, Radar, SecH, OvrBadge, H2HChart } from '../components/ui.jsx';

/* 开赛时间格式化 (本地时区) */
function fmtKick(iso) {
  if (!iso) return { day: '待定', time: '' };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return { day: `${d.getMonth() + 1}月${d.getDate()}日`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/* 赛事名 英->中 (历史交锋明细) */
const COMP_ZH = {
  'World Cup': '世界杯',
  'Friendlies': '友谊赛',
  'Copa America': '美洲杯',
  'Euro Championship': '欧洲杯',
  'UEFA Nations League': '欧国联',
  'Africa Cup of Nations': '非洲杯',
  'Asian Cup': '亚洲杯',
  'CONCACAF Gold Cup': '金杯赛',
  'Confederations Cup': '联合会杯',
};
const compLabel = (c) => COMP_ZH[c] || c || '比赛';

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
export function MatchesScreen({ onOpenMatch }) {
  const { matches, byCode } = useData();
  const oddsFor = (m) => {
    const A = byCode[m.home.code];
    const B = byCode[m.away.code];
    return A && B ? odds(A, B) : { win: 33, draw: 34, loss: 33 };
  };

  const focus = matches.find((x) => x.status === 'live') || matches[0];

  return (
    <div className="screen pop">
      {focus && (() => {
        const o = oddsFor(focus);
        const favHome = o.win >= o.loss;
        const fav = favHome ? focus.home : focus.away;
        const favp = Math.max(o.win, o.loss);
        const k = fmtKick(focus.kickoff);
        const live = focus.status === 'live';
        return (
          <>
            <SecH>今日焦点</SecH>
            <div className="card press" onClick={() => onOpenMatch(focus)}
              style={{ background: 'linear-gradient(160deg,#1fcabb,#11a89b)', border: 'none', color: '#fff', boxShadow: '0 6px 0 0 #0d8b80, 0 10px 20px rgba(17,168,155,.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span className="chip" style={{ background: 'rgba(255,255,255,.22)', color: '#fff', border: 'none' }}>{focus.stage}</span>
                {live
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 900, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc00', boxShadow: '0 0 0 3px rgba(255,204,0,.4)' }} />进行中</span>
                  : <span style={{ fontWeight: 800, fontSize: 12, opacity: .9 }}>{k.day} {k.time}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 96 }}>
                  <FlagBadge code={focus.home.code} size={56} />
                  <span style={{ fontWeight: 900, fontSize: 15 }}>{focus.home.name}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: .85, marginBottom: 2 }}>预测胜率</div>
                  <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{favp}<span style={{ fontSize: 18 }}>%</span></div>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: .9, marginTop: 2 }}>{fav.name}领先</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 96 }}>
                  <FlagBadge code={focus.away.code} size={56} />
                  <span style={{ fontWeight: 900, fontSize: 15 }}>{focus.away.name}</span>
                </div>
              </div>
              <div className="btn btn-block" style={{ marginTop: 16, background: '#ffcc00', color: '#725d42', boxShadow: '0 5px 0 0 #e0b800', height: 42 }}>查看完整预测 ›</div>
            </div>
          </>
        );
      })()}

      <SecH>全部赛程</SecH>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {matches.map((m) => {
          const o = oddsFor(m);
          const k = fmtKick(m.kickoff);
          return (
            <div key={m.id} className="card press" onClick={() => onOpenMatch(m)} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
                <span className="chip">{m.stage}</span>
                <span style={{ fontWeight: 800, fontSize: 11.5, color: '#9f927d' }}>{k.day} · {k.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FlagBadge code={m.home.code} size={40} />
                <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27', flex: 1 }}>{m.home.name}</span>
                <span style={{ fontWeight: 800, fontSize: 12, color: '#c4b89e' }}>VS</span>
                <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27', flex: 1, textAlign: 'right' }}>{m.away.name}</span>
                <FlagBadge code={m.away.code} size={40} />
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

/* ---------------- 单场预测详情 (调后端 /prediction) ---------------- */
export function MatchDetailScreen({ match, onOpenTeam }) {
  const { byCode } = useData();
  const [pred, setPred] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState(null);
  const aiRequest = useRef(null);
  const mounted = useRef(true);

  const A = byCode[match.home.code];
  const B = byCode[match.away.code];

  useEffect(() => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    setLoading(true);
    setErr(null);
    api.prediction(match.id, { ai: false, signal: controller.signal })
      .then((p) => {
        if (mounted.current) setPred(p);
      })
      .catch((e) => {
        if (mounted.current && e.name !== 'AbortError') setErr(e.message);
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [match.id]);

  useEffect(() => () => {
    mounted.current = false;
    aiRequest.current?.abort();
  }, []);

  const runAi = (refresh = false) => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAiLoading(true);
    setErr(null);
    api.prediction(match.id, { ai: true, refresh, signal: controller.signal })
      .then((p) => {
        if (mounted.current) setPred(p);
      })
      .catch((e) => {
        if (mounted.current && e.name !== 'AbortError') setErr(e.message);
      })
      .finally(() => {
        if (aiRequest.current === controller) {
          aiRequest.current = null;
          if (mounted.current) setAiLoading(false);
        }
      });
  };

  if (loading || !pred) {
    return <div className="screen pop"><div className="card" style={{ textAlign: 'center', padding: 40, color: '#9f927d', fontWeight: 800 }}>{err ? `加载失败: ${err}` : '加载预测中…'}</div></div>;
  }

  const p = pred.prediction; // 当前生效预测 (elo 或 ai)
  const bl = pred.baseline;
  const isAi = p.engine === 'ai';
  const result = p.win > p.loss ? `${match.home.name}胜` : p.loss > p.win ? `${match.away.name}胜` : '势均力敌';

  return (
    <div className="screen pop">
      {/* 对阵卡 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="press" onClick={() => onOpenTeam(match.home.code)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 90 }}>
            <FlagBadge code={match.home.code} size={62} />
            <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{match.home.name}</span>
            <span className="chip mint" style={{ padding: '2px 9px' }}>实力 {A?.ovr ?? match.home.ovr}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>预测比分</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#794f27', lineHeight: 1.1, letterSpacing: '0.04em' }}>{p.predScoreHome}<span style={{ color: '#c4b89e', margin: '0 4px' }}>:</span>{p.predScoreAway}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>预期进球 {bl.score.xgA} - {bl.score.xgB}</div>
          </div>
          <div className="press" onClick={() => onOpenTeam(match.away.code)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 90 }}>
            <FlagBadge code={match.away.code} size={62} />
            <span style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{match.away.name}</span>
            <span className="chip mint" style={{ padding: '2px 9px' }}>实力 {B?.ovr ?? match.away.ovr}</span>
          </div>
        </div>
      </div>

      {/* 胜率预测 */}
      <SecH>胜率预测</SecH>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className={'chip ' + (isAi ? 'mint' : '')} style={{ flex: 'none' }}>
            {isAi ? `🤖 AI 模型 · ${p.model ?? p.provider}` : '📊 Elo 基线模型'}
          </span>
          {pred.aiFallback && <span className="chip yellow">未配置 AI 密钥,已回退 Elo</span>}
        </div>
        <ProbBar win={p.win} draw={p.draw} loss={p.loss} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#11a89b' }}>{p.win}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{match.home.name}胜</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#a07e08' }}>{p.draw}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>平局</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: '#e05a5a' }}>{p.loss}%</div><div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d' }}>{match.away.name}胜</div></div>
        </div>
        <div style={{ marginTop: 14, padding: '12px 14px', background: '#fff', borderRadius: 16, border: '2px dashed #e6ddc6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="chip green" style={{ flex: 'none' }}>模型判断</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#725d42' }}>看好 <b style={{ color: '#11a89b' }}>{result}</b>,置信度 {p.confidence}%</span>
        </div>
        {!isAi && (
          <button className="btn btn-mint btn-block" style={{ marginTop: 14 }} onClick={() => runAi(false)} disabled={aiLoading}>
            {aiLoading ? 'AI 分析中…' : '🤖 AI 深度预测'}
          </button>
        )}
        {isAi && (
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => runAi(true)} disabled={aiLoading}>
            {aiLoading ? 'AI 分析中…' : '↻ 重新预测'}
          </button>
        )}
      </div>

      {/* 关键因素 + AI 分析 */}
      {(p.keyFactors?.length > 0 || p.reasoning) && (
        <>
          <SecH>{isAi ? 'AI 分析' : '关键因素'}</SecH>
          <div className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: p.reasoning ? 12 : 0 }}>
              {p.keyFactors.map((kf, i) => <span key={i} className="chip green">{kf}</span>)}
            </div>
            {p.reasoning && <div style={{ fontSize: 13, fontWeight: 600, color: '#725d42', lineHeight: 1.7 }}>{p.reasoning}</div>}
          </div>
        </>
      )}

      {/* 实力对比 */}
      <SecH>实力对比</SecH>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 900, fontSize: 13 }}>
          <span style={{ color: '#794f27' }}>{match.home.name}</span>
          <span style={{ color: '#794f27' }}>{match.away.name}</span>
        </div>
        {bl.factors.map((f, i) => <CompareRow key={i} f={f} />)}
      </div>

      {/* 历史交锋 对阵图 */}
      <SecH>历史交锋</SecH>
      <H2HChart
        home={match.home}
        away={match.away}
        h2h={bl.h2h}
        recent={pred.h2hRecent || []}
        real={pred.h2hReal}
        compLabel={compLabel}
      />
      {!pred.h2hReal && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', textAlign: 'center', marginTop: -6, marginBottom: 4 }}>
          ⓘ 暂无真实交锋数据,以上为模型估算
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenTeam(match.home.code)}>{match.home.name}数据</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onOpenTeam(match.away.code)}>{match.away.name}数据</button>
      </div>
    </div>
  );
}

/* ---------------- 球队列表 ---------------- */
export function TeamsScreen({ onOpenTeam }) {
  const { teams } = useData();
  return (
    <div className="screen pop">
      <SecH>球队实力榜</SecH>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {teams.map((t, i) => (
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
export function TeamDetailScreen({ code, onOpenPlayer }) {
  const { byCode } = useData();
  const t = byCode[code];
  if (!t) return <div className="screen pop"><div className="card">未找到球队</div></div>;
  return (
    <div className="screen pop">
      <div className="card" style={{ textAlign: 'center', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><FlagBadge code={code} size={72} /></div>
        <div style={{ fontWeight: 900, fontSize: 22, color: '#794f27' }}>{t.name}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginBottom: 12 }}>{t.note}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
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
      {t.squad.length === 0 && (
        <div className="card flat" style={{ color: '#9f927d', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
          暂无该队球员数据 (可导入 FC26 数据集补全)
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {t.squad.map((pl) => (
          <div key={pl.id} className="card press" onClick={() => onOpenPlayer(pl)} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
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
export function PlayersScreen({ onOpenPlayer }) {
  const { players, byCode } = useData();
  const [filter, setFilter] = useState('全部');
  const posMap = { 前锋: 'FW', 中场: 'MF', 后卫: 'DF', 门将: 'GK' };
  const tabs = ['全部', '前锋', '中场', '后卫', '门将'];
  const list = filter === '全部' ? players : players.filter((pl) => pl.pos === posMap[filter]);

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
          <div key={pl.id} className="card press" onClick={() => onOpenPlayer(pl)} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
            <FlagBadge code={pl.team.code} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: '#794f27' }}>{pl.name}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{pl.team.name} · {pl.pos} · {pl.age}岁</div>
            </div>
            <OvrBadge value={pl.ovr} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 球员详情 (五边形) ---------------- */
export function PlayerDetailScreen({ player }) {
  const { byCode } = useData();
  const accent = byCode[player.team.code]?.accent || '#19c8b9';
  const entries = Object.entries(player.radar);
  const top = [...entries].sort((a, b) => b[1] - a[1]);
  const trait = `擅长${top[0][0]}与${top[1][0]}`;
  return (
    <div className="screen pop">
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <FlagBadge code={player.team.code} size={50} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 21, color: '#794f27', lineHeight: 1.1 }}>{player.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginTop: 3 }}>{player.team.name} · {player.pos} · {player.num}号</div>
          </div>
          <OvrBadge value={player.ovr} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span className="chip">{player.age}岁</span>
          <span className="chip mint" style={{ flex: 1, justifyContent: 'center' }}>{player.club}</span>
        </div>
      </div>

      <SecH>能力雷达</SecH>
      <div className="card" style={{ paddingBottom: 8 }}>
        <div className="radar-wrap">
          <Radar stats={player.radar} size={258} color="#19c8b9" accent={accent} />
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
