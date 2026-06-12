/* ===========================================================
   竞彩屏幕: 赛程列表 + 单场详情 + 竞彩战绩 (数据来自 Firo API)
   =========================================================== */
import { useState, useEffect, useRef } from 'react';
import { api } from '../data/api.js';
import { SecH, Sparkline } from '../components/ui.jsx';

const POOL_LABEL = { HAD: '胜平负', HHAD: '让球', HAFU: '半全场', TTG: '总进球', CRS: '比分' };
const POOL_CODES = ['HAD', 'HHAD', 'HAFU', 'TTG', 'CRS'];
const TIER_STYLE = {
  '稳健': { bg: '#eef7e2', color: '#5a9e1e', border: '#d6ebbb', emoji: '🟢' },
  '均衡': { bg: '#fdf3cf', color: '#a07e08', border: '#f4e29a', emoji: '🟡' },
  '博胆': { bg: '#fff0f0', color: '#e05a5a', border: '#f8c8c8', emoji: '🔴' },
};
const tierStyle = (tier) => TIER_STYLE[tier] || { bg: '#f8f8f0', color: '#9f927d', border: '#e6ddc6', emoji: '⚪' };
const FINISHED_STATUS = new Set(['FT', 'AET', 'PEN', 'END', 'FINISHED']);
const LIVE_STATUS = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'IN_PLAY']);
const LIVE_WINDOW_MS = 150 * 60 * 1000;

function parseKickoffMs(mm) {
  const date = mm.matchStartDate || mm.matchDate;
  if (!date || !mm.matchTime) return null;
  const time = String(mm.matchTime).length === 5 ? `${mm.matchTime}:00` : mm.matchTime;
  const d = new Date(`${date}T${time}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function displayKickoff(mm) {
  return `${(mm.matchStartDate || mm.matchDate || '').slice(5)} ${mm.matchTime || ''}`.trim();
}

function matchPhase(mm, now = Date.now()) {
  const status = String(mm.matchStatus || mm.status || '').toUpperCase();
  if (FINISHED_STATUS.has(status)) return 'finished';
  if (LIVE_STATUS.has(status)) return 'live';
  if (mm.homeScore != null && mm.awayScore != null) return 'finished';
  const kickoff = parseKickoffMs(mm);
  if (kickoff && now >= kickoff && now < kickoff + LIVE_WINDOW_MS) return 'live';
  return 'upcoming';
}

function phaseMeta(phase) {
  if (phase === 'finished') return { label: '已结束', className: 'green', color: '#5a9e1e' };
  if (phase === 'live') return { label: '进行中', className: 'mint', color: '#11a89b' };
  return { label: '即将开赛', className: '', color: '#9f927d' };
}

function hasScore(mm) {
  return mm.homeScore != null && mm.awayScore != null;
}

/* 赔率单元: value + 升降箭头 */
export function OddsCell({ label, value, flag, big }) {
  const rising = flag === 1, falling = flag === -1;
  const valColor = rising ? '#6fba2c' : falling ? '#e05a5a' : '#794f27';
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 10, color: '#9f927d', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 17, fontWeight: 900, color: valColor, lineHeight: 1 }}>
        {value}
        {rising && <span style={{ fontSize: big ? 13 : 10, color: '#6fba2c' }}>↑</span>}
        {falling && <span style={{ fontSize: big ? 13 : 10, color: '#e05a5a' }}>↓</span>}
      </div>
    </div>
  );
}

/* 三格赔率条 (胜/平/负) */
function OddsRow({ home, draw, away, homeLabel, awayLabel, goalLine, big }) {
  return (
    <div style={{ background: '#fff', borderRadius: big ? 18 : 14, padding: big ? '14px 16px' : '10px 12px', border: '2px solid #e6ddc6' }}>
      {goalLine && (
        <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', textAlign: 'center', marginBottom: 6 }}>
          让球 <span style={{ color: '#11a89b', fontWeight: 900 }}>{goalLine}</span>
        </div>
      )}
      <div style={{ display: 'flex' }}>
        <OddsCell label={homeLabel} value={home} big={big} />
        <div style={{ width: 1, background: '#e6ddc6', margin: '0 4px' }} />
        <OddsCell label="平" value={draw} big={big} />
        <div style={{ width: 1, background: '#e6ddc6', margin: '0 4px' }} />
        <OddsCell label={awayLabel} value={away} big={big} />
      </div>
    </div>
  );
}

/* 赔率历史迷你表 (最新 6 条) */
function OddsTrendTable({ records, homeLabel, awayLabel }) {
  if (!records?.length) return null;
  const shown = records.slice(-6).reverse();
  const flagChar = (f) => f === 1 ? '↑' : f === -1 ? '↓' : '';
  const flagColor = (f) => f === 1 ? '#6fba2c' : f === -1 ? '#e05a5a' : '#9f927d';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontWeight: 700 }}>
        <thead>
          <tr style={{ color: '#9f927d', borderBottom: '2px solid #e6ddc6' }}>
            <td style={{ padding: '5px 4px' }}>时间</td>
            <td style={{ padding: '5px 4px', textAlign: 'center' }}>{homeLabel}胜</td>
            <td style={{ padding: '5px 4px', textAlign: 'center' }}>平</td>
            <td style={{ padding: '5px 4px', textAlign: 'center' }}>{awayLabel}胜</td>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1.5px dashed #e6ddc6', color: '#725d42' }}>
              <td style={{ padding: '5px 4px', color: '#9f927d', whiteSpace: 'nowrap' }}>{r.updateTime?.slice(11, 16) || '--'}</td>
              <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                <span style={{ color: '#794f27' }}>{r.homeWinOdds}</span>
                <span style={{ color: flagColor(r.homeWinFlag), marginLeft: 2 }}>{flagChar(r.homeWinFlag)}</span>
              </td>
              <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                <span style={{ color: '#794f27' }}>{r.drawOdds}</span>
                <span style={{ color: flagColor(r.drawFlag), marginLeft: 2 }}>{flagChar(r.drawFlag)}</span>
              </td>
              <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                <span style={{ color: '#794f27' }}>{r.awayWinOdds}</span>
                <span style={{ color: flagColor(r.awayWinFlag), marginLeft: 2 }}>{flagChar(r.awayWinFlag)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 近期战绩行 */
function RecentRow({ r }) {
  const scoreColor = r.winner === 'home' ? '#11a89b' : r.winner === 'away' ? '#e05a5a' : '#a07e08';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1.5px dashed #e6ddc6' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9f927d', width: 48, flex: 'none' }}>{r.matchDate?.slice(5)}</div>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#725d42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.homeTeamName} <span style={{ color: '#c4b89e' }}>v</span> {r.awayTeamName}
      </div>
      <div style={{ fontWeight: 900, fontSize: 13, color: scoreColor, flex: 'none' }}>{r.fullScore}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9f927d', flex: 'none', width: 30, textAlign: 'right' }}>{r.halfScore}</div>
    </div>
  );
}

/* ── 竞彩赛程列表 ── */
export function LotteryScreen({ onOpenMatch, onOpenAccuracy }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('upcoming');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api.lotteryMatches()
      .then(setMatches)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return (
    <div className="screen pop">
      <div className="card" style={{ textAlign: 'center', padding: 40, color: '#9f927d', fontWeight: 800 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🎲</div>
        加载竞彩赛程…
      </div>
    </div>
  );

  if (err) return (
    <div className="screen pop">
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: '#e05a5a', marginBottom: 8 }}>加载失败</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d' }}>{err}</div>
      </div>
    </div>
  );

  const counts = matches.reduce((acc, m) => {
    const phase = matchPhase(m.matchMain, now);
    acc[phase] = (acc[phase] || 0) + 1;
    acc.all++;
    return acc;
  }, { all: 0, live: 0, upcoming: 0, finished: 0 });
  const shownMatches = phaseFilter === 'all'
    ? matches
    : matches.filter((m) => matchPhase(m.matchMain, now) === phaseFilter);
  const filters = [
    ['all', '全部', counts.all],
    ['live', '进行中', counts.live],
    ['upcoming', '即将开赛', counts.upcoming],
    ['finished', '已结束', counts.finished],
  ];

  return (
    <div className="screen pop">
      {/* 竞彩战绩入口 */}
      <div className="card press" onClick={onOpenAccuracy}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>🎯</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 900, fontSize: 13, color: '#794f27' }}>竞彩战绩</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginLeft: 8 }}>AI 注单命中率 · ROI</span>
        </div>
        <span style={{ fontSize: 18, color: '#c4b89e', fontWeight: 900 }}>›</span>
      </div>

      <SecH>竞彩赛程</SecH>
      <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
        {filters.map(([key, label, count]) => (
          <button key={key} onClick={() => setPhaseFilter(key)}
            className="chip"
            style={{
              cursor: 'pointer',
              border: 'none',
              background: phaseFilter === key ? '#19c8b9' : '#fff',
              color: phaseFilter === key ? '#fff' : '#8a7b66',
              boxShadow: phaseFilter === key ? '0 3px 0 0 #11a89b' : '0 2px 0 0 #e6ddc6',
              padding: '7px 12px',
            }}>
            {label} {count}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {shownMatches.map((m) => {
          const mm = m.matchMain;
          const had = m.matchOddsList?.find((o) => o.poolCode === 'HAD');
          const hhad = m.matchOddsList?.find((o) => o.poolCode === 'HHAD');
          const sellingPools = (m.matchPoolList || []).filter((p) => p.poolStatus === 'Selling').map((p) => p.poolCode);
          const phase = matchPhase(mm, now);
          const meta = phaseMeta(phase);
          const isInactive = phase === 'finished';

          return (
            <div key={mm.matchId} className="card press" onClick={() => onOpenMatch(m)}
              style={{ padding: 14, opacity: isInactive ? 0.82 : 1 }}>
              {/* 头部: 联赛 + 场次号 + 时间 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="chip" style={{ fontSize: 10, padding: '3px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mm.leagueShort || mm.leagueName}
                </span>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#11a89b' }}>{mm.matchNumStr}</span>
                <span className={'chip ' + meta.className} style={{ fontSize: 10, padding: '3px 9px', color: meta.color }}>
                  {meta.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: '#9f927d' }}>
                  {displayKickoff(mm)}
                </span>
              </div>

              {/* 球队名 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hhad ? 10 : 0 }}>
                {mm.homeTeamBadgeUrl && (
                  <img src={mm.homeTeamBadgeUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #e6ddc6', flex: 'none' }}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mm.homeTeamName}</span>
                <span style={{ fontWeight: 900, fontSize: hasScore(mm) ? 17 : 12, color: hasScore(mm) ? '#11a89b' : '#c4b89e', flex: 'none', minWidth: hasScore(mm) ? 46 : 24, textAlign: 'center' }}>
                  {hasScore(mm) ? `${mm.homeScore}:${mm.awayScore}` : 'VS'}
                </span>
                <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mm.awayTeamName}</span>
                {mm.awayTeamBadgeUrl && (
                  <img src={mm.awayTeamBadgeUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #e6ddc6', flex: 'none' }}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                )}
              </div>

              {/* HAD 赔率 */}
              {had && (
                <div style={{ background: '#fff', borderRadius: 14, padding: '8px 12px', border: '2px solid #e6ddc6', marginBottom: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', marginBottom: 5 }}>胜平负</div>
                  <div style={{ display: 'flex' }}>
                    <OddsCell label={mm.homeTeamName.slice(0, 5)} value={had.homeOdds} />
                    <OddsCell label="平" value={had.drawOdds} />
                    <OddsCell label={mm.awayTeamName.slice(0, 5)} value={had.awayOdds} />
                  </div>
                </div>
              )}

              {/* HHAD 让球 */}
              {hhad && (
                <div style={{ background: '#f8f4ec', borderRadius: 14, padding: '8px 12px', border: '2px solid #e6ddc6', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d' }}>让球胜平负</span>
                    <span style={{ fontSize: 10, fontWeight: 900, color: '#11a89b' }}>让 {hhad.goalLine}</span>
                  </div>
                  <div style={{ display: 'flex' }}>
                    <OddsCell label={mm.homeTeamName.slice(0, 5)} value={hhad.homeOdds} />
                    <OddsCell label="平" value={hhad.drawOdds} />
                    <OddsCell label={mm.awayTeamName.slice(0, 5)} value={hhad.awayOdds} />
                  </div>
                </div>
              )}

              {/* 玩法状态 */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                {POOL_CODES.map((code) => (
                  <span key={code} className={'chip' + (sellingPools.includes(code) ? ' mint' : '')}
                    style={{ fontSize: 10, padding: '3px 9px' }}>
                    {POOL_LABEL[code]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 竞彩单场详情 ── */
export function LotteryDetailScreen({ match }) {
  const mm = match.matchMain;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [oddsTab, setOddsTab] = useState('HAD');
  const [aiLoading, setAiLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [aiErr, setAiErr] = useState(null);
  const [reasoning, setReasoning] = useState('');
  const aiRequest = useRef(null);

  useEffect(() => {
    setAnalysis(null);
    setAiErr(null);
    setReasoning('');
    setErr(null);
    setDetail(null);
    setLoading(true);
    api.lotteryMatch(mm.matchId)
      .then((d) => {
        setDetail(d);
        if (d.latestAnalysis) setAnalysis(d.latestAnalysis);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [mm.matchId]);

  useEffect(() => () => { aiRequest.current?.abort(); }, []);

  const had = match.matchOddsList?.find((o) => o.poolCode === 'HAD');
  const hhad = match.matchOddsList?.find((o) => o.poolCode === 'HHAD');
  const pools = match.matchPoolList || [];
  const isSelling = (code) => pools.find((p) => p.poolCode === code)?.poolStatus === 'Selling';
  const meta = phaseMeta(matchPhase(mm));

  const runAnalysis = () => {
    aiRequest.current?.abort();
    const controller = new AbortController();
    aiRequest.current = controller;
    setAiLoading(true);
    setAiErr(null);
    setReasoning('');
    setAnalysis(null);
    api.lotteryAnalysisStream(mm.matchId, {
      signal: controller.signal,
      onEvent: (event) => {
        if (controller.signal.aborted) return;
        if (event.type === 'thinking' || event.type === 'text') {
          setReasoning((prev) => prev + event.delta);
        }
        if (event.type === 'analysis') {
          setAnalysis(event.analysis);
        }
        if (event.type === 'done') {
          setAiLoading(false);
          if (aiRequest.current === controller) aiRequest.current = null;
        }
        if (event.type === 'error') {
          setAiErr(event.message);
          setAiLoading(false);
          if (aiRequest.current === controller) aiRequest.current = null;
        }
      },
    }).catch((e) => {
      if (e.name !== 'AbortError') {
        setAiErr(e.message);
        setAiLoading(false);
      }
      if (aiRequest.current === controller) aiRequest.current = null;
    });
  };

  const info = detail?.info;
  const oddsHistory = detail?.oddsHistory;

  return (
    <div className="screen pop">
      {/* 对阵卡 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="chip mint" style={{ fontSize: 11 }}>{mm.matchNumStr}</span>
          <span className="chip" style={{ fontSize: 10 }}>{mm.leagueShort || mm.leagueName}</span>
          <span className={'chip ' + meta.className} style={{ fontSize: 10, padding: '3px 9px', color: meta.color }}>{meta.label}</span>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: -7, marginBottom: 10 }}>
          {mm.matchStartDate || mm.matchDate} {mm.matchTime}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 96 }}>
            {mm.homeTeamBadgeUrl
              ? <img src={mm.homeTeamBadgeUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 2px 0 0 #d4c9b4, 0 0 0 2px #e6ddc6' }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6ddc6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚽</div>
            }
            <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', textAlign: 'center' }}>{mm.homeTeamName}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d', marginBottom: 4 }}>主场</div>
            <div style={{ fontSize: hasScore(mm) ? 32 : 26, fontWeight: 900, color: hasScore(mm) ? '#11a89b' : '#c4b89e', letterSpacing: hasScore(mm) ? '0.02em' : '0.1em' }}>
              {hasScore(mm) ? `${mm.homeScore}:${mm.awayScore}` : 'VS'}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#9f927d', marginTop: 4 }}>客场</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 96 }}>
            {mm.awayTeamBadgeUrl
              ? <img src={mm.awayTeamBadgeUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 2px 0 0 #d4c9b4, 0 0 0 2px #e6ddc6' }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6ddc6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚽</div>
            }
            <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', textAlign: 'center' }}>{mm.awayTeamName}</span>
          </div>
        </div>
      </div>

      {/* 实时赔率 */}
      <SecH>实时赔率</SecH>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {POOL_CODES.map((code) => (
          <button key={code} onClick={() => setOddsTab(code)}
            className="chip"
            disabled={!isSelling(code) && code !== 'HAD' && code !== 'HHAD'}
            style={{
              cursor: isSelling(code) || code === 'HAD' || code === 'HHAD' ? 'pointer' : 'default',
              border: 'none',
              background: oddsTab === code ? '#19c8b9' : '#fff',
              color: oddsTab === code ? '#fff' : '#8a7b66',
              boxShadow: oddsTab === code ? '0 3px 0 0 #11a89b' : '0 2px 0 0 #e6ddc6',
              padding: '7px 14px',
              opacity: !isSelling(code) && code !== 'HAD' && code !== 'HHAD' ? 0.45 : 1,
            }}>
            {POOL_LABEL[code]}
          </button>
        ))}
      </div>

      {oddsTab === 'HAD' && had && (
        <OddsRow
          home={had.homeOdds} draw={had.drawOdds} away={had.awayOdds}
          homeLabel={mm.homeTeamName} awayLabel={mm.awayTeamName}
          big
        />
      )}
      {oddsTab === 'HHAD' && hhad && (
        <OddsRow
          home={hhad.homeOdds} draw={hhad.drawOdds} away={hhad.awayOdds}
          homeLabel={mm.homeTeamName} awayLabel={mm.awayTeamName}
          goalLine={hhad.goalLine} big
        />
      )}

      {/* HAFU 半全场赔率网格 */}
      {oddsTab === 'HAFU' && (() => {
        const raw = oddsHistory?.hafuOddsList;
        if (!raw?.length) return <div className="card" style={{ textAlign: 'center', padding: 20, color: '#9f927d', fontWeight: 700, fontSize: 12 }}>暂无半全场赔率数据</div>;
        const latest = parsePoolSnapshot(raw, 'HAFU');
        const labels = ['主-主', '主-平', '主-客', '平-主', '平-平', '平-客', '客-主', '客-平', '客-客'];
        const codes = ['HH', 'HD', 'HA', 'DH', 'DD', 'DA', 'AH', 'AD', 'AA'];
        return (
          <div style={{ background: '#fff', borderRadius: 18, padding: 14, border: '2px solid #e6ddc6' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {codes.map((c, i) => {
                const odds = latest[c] ?? latest[c.toLowerCase()] ?? '-';
                return (
                  <div key={c} style={{ textAlign: 'center', padding: '8px 4px', background: '#faf6ee', borderRadius: 12, border: '1.5px solid #e6ddc6' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', marginBottom: 3 }}>{labels[i]}</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#794f27' }}>{odds}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* TTG 总进球赔率网格 */}
      {oddsTab === 'TTG' && (() => {
        const raw = oddsHistory?.ttgOddsList;
        if (!raw?.length) return <div className="card" style={{ textAlign: 'center', padding: 20, color: '#9f927d', fontWeight: 700, fontSize: 12 }}>暂无总进球赔率数据</div>;
        const latest = parsePoolSnapshot(raw, 'TTG');
        const goals = ['0', '1', '2', '3', '4', '5', '6', '7+'];
        return (
          <div style={{ background: '#fff', borderRadius: 18, padding: 14, border: '2px solid #e6ddc6' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {goals.map((g) => {
                const odds = latest[g] ?? latest[`s${g}`] ?? '-';
                return (
                  <div key={g} style={{ textAlign: 'center', padding: '8px 4px', background: '#faf6ee', borderRadius: 12, border: '1.5px solid #e6ddc6' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', marginBottom: 3 }}>{g} 球</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#794f27' }}>{odds}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* CRS 比分赔率网格 */}
      {oddsTab === 'CRS' && (() => {
        const raw = oddsHistory?.crsOddsList;
        if (!raw?.length) return <div className="card" style={{ textAlign: 'center', padding: 20, color: '#9f927d', fontWeight: 700, fontSize: 12 }}>暂无比分赔率数据</div>;
        const latest = parsePoolSnapshot(raw, 'CRS');
        const homeScores = ['1:0','2:0','2:1','3:0','3:1','3:2','4:0','4:1','4:2'];
        const drawScores = ['0:0','1:1','2:2','3:3'];
        const awayScores = ['0:1','0:2','1:2','0:3','1:3','2:3','0:4','1:4','2:4'];
        const renderScoreGroup = (title, color, scores) => (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color, marginBottom: 6 }}>{title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {scores.map((s) => {
                const odds = latest[s] ?? latest[s.replace(':', '')] ?? '-';
                return (
                  <div key={s} style={{ textAlign: 'center', padding: '6px 2px', background: '#faf6ee', borderRadius: 10, border: '1.5px solid #e6ddc6' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', marginBottom: 2 }}>{s}</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#794f27' }}>{odds}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
        const otherOdds = latest['胜其他'] ?? latest['WIN_OTHER'] ?? latest['other_h'] ?? '-';
        const drawOtherOdds = latest['平其他'] ?? latest['DRAW_OTHER'] ?? latest['other_d'] ?? '-';
        const lossOtherOdds = latest['负其他'] ?? latest['LOSS_OTHER'] ?? latest['other_a'] ?? '-';
        return (
          <div style={{ background: '#fff', borderRadius: 18, padding: 14, border: '2px solid #e6ddc6' }}>
            {renderScoreGroup(`${mm.homeTeamName}胜`, '#11a89b', homeScores)}
            {renderScoreGroup('平局', '#a07e08', drawScores)}
            {renderScoreGroup(`${mm.awayTeamName}胜`, '#e05a5a', awayScores)}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[['胜其他', otherOdds, '#11a89b'], ['平其他', drawOtherOdds, '#a07e08'], ['负其他', lossOtherOdds, '#e05a5a']].map(([label, odds, color]) => (
                <div key={label} style={{ flex: 1, textAlign: 'center', padding: '6px 2px', background: '#faf6ee', borderRadius: 10, border: '1.5px solid #e6ddc6' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#9f927d', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color }}>{odds}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 玩法开售状态 */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
        {POOL_CODES.map((code) => (
          <span key={code}
            className={'chip' + (isSelling(code) ? ' green' : '')}
            style={{ fontSize: 11 }}>
            {isSelling(code) ? '✓' : '✕'} {POOL_LABEL[code]}
          </span>
        ))}
      </div>

      {/* 赔率走势 */}
      {!loading && oddsHistory && (oddsTab === 'HAD' || oddsTab === 'HHAD') && (
        <>
          <SecH>赔率走势</SecH>
          <div className="card" style={{ padding: '14px 12px' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['HAD', 'HHAD'].map((code) => (
                <button key={code} onClick={() => setOddsTab(code)}
                  className="chip"
                  style={{
                    cursor: 'pointer', border: 'none',
                    background: oddsTab === code ? '#19c8b9' : '#fff',
                    color: oddsTab === code ? '#fff' : '#8a7b66',
                    boxShadow: oddsTab === code ? '0 3px 0 0 #11a89b' : '0 2px 0 0 #e6ddc6',
                    padding: '5px 14px',
                  }}>
                  {POOL_LABEL[code]}
                </button>
              ))}
            </div>
            {/* 赔率走势折线图 */}
            {(() => {
              const records = oddsTab === 'HAD' ? oddsHistory.hadOddsList : oddsHistory.hhadOddsList;
              if (!records?.length) return null;
              return (
                <div style={{ marginBottom: 12 }}>
                  <Sparkline
                    height={64}
                    series={[
                      { label: '主胜', color: '#11a89b', data: records.map((r) => Number(r.homeWinOdds)) },
                      { label: '平', color: '#a07e08', data: records.map((r) => Number(r.drawOdds)) },
                      { label: '客胜', color: '#e05a5a', data: records.map((r) => Number(r.awayWinOdds)) },
                    ]}
                  />
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6 }}>
                    {[['主胜', '#11a89b'], ['平', '#a07e08'], ['客胜', '#e05a5a']].map(([l, c]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#9f927d' }}>
                        <span style={{ width: 10, height: 3, borderRadius: 2, background: c }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            <OddsTrendTable
              records={oddsTab === 'HAD' ? oddsHistory.hadOddsList : oddsHistory.hhadOddsList}
              homeLabel={mm.homeTeamName.slice(0, 4)}
              awayLabel={mm.awayTeamName.slice(0, 4)}
            />
          </div>
        </>
      )}

      {/* 综合情报 (异步) */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 30, color: '#9f927d', fontWeight: 800, marginTop: 20 }}>
          加载情报数据…
        </div>
      )}

      {err && (
        <div className="card" style={{ textAlign: 'center', padding: 20, marginTop: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e05a5a' }}>情报加载失败: {err}</span>
        </div>
      )}

      {info && (
        <>
          {/* H2H 历史 */}
          <SecH>历史交锋</SecH>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#11a89b' }}>{info.history.wins}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{mm.homeTeamName}胜</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#a07e08' }}>{info.history.draws}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>平</div>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#e05a5a' }}>{info.history.losses}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{mm.awayTeamName}胜</div>
              </div>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 50, overflow: 'hidden', gap: 2 }}>
              <div style={{ flex: info.history.wins, background: '#19c8b9', minWidth: info.history.wins ? 4 : 0, transition: 'flex .7s' }} />
              <div style={{ flex: info.history.draws, background: '#d8cba6', minWidth: info.history.draws ? 4 : 0, transition: 'flex .7s' }} />
              <div style={{ flex: info.history.losses, background: '#e05a5a', minWidth: info.history.losses ? 4 : 0, transition: 'flex .7s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontWeight: 700, color: '#9f927d' }}>
              <span>共 {info.history.totalMatches} 场</span>
              <span>总进球 {info.history.totalGoals}</span>
              <span>净球 {info.history.netGoals >= 0 ? '+' : ''}{info.history.netGoals}</span>
            </div>
          </div>

          {/* 主客场特征 */}
          <SecH>主客场表现</SecH>
          <div className="card">
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 12, color: '#794f27', marginBottom: 8 }}>{mm.homeTeamName} 主场</div>
                {[
                  { label: '胜', value: info.feature.homeTeamHomeWins, color: '#11a89b' },
                  { label: '平', value: info.feature.homeTeamHomeDraws, color: '#a07e08' },
                  { label: '负', value: info.feature.homeTeamHomeLosses, color: '#e05a5a' },
                ].map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 14, fontSize: 10, fontWeight: 800, color: '#9f927d' }}>{r.label}</span>
                    <div style={{ flex: 1, height: 10, background: '#ece3cf', borderRadius: 50 }}>
                      <div style={{ width: `${info.feature.homeTeamHomeScoreRatio}%`, height: '100%', background: r.color, borderRadius: 50, minWidth: r.value ? 4 : 0 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 900, color: r.color, width: 18, textAlign: 'right' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>场均进 {info.feature.homeTeamAvgGoals} / 失 {info.feature.homeTeamAvgLossGoals}</div>
              </div>
              <div style={{ width: 1, background: '#e6ddc6' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 12, color: '#794f27', marginBottom: 8 }}>{mm.awayTeamName} 客场</div>
                {[
                  { label: '胜', value: info.feature.awayTeamAwayWins, color: '#11a89b' },
                  { label: '平', value: info.feature.awayTeamAwayDraws, color: '#a07e08' },
                  { label: '负', value: info.feature.awayTeamAwayLosses, color: '#e05a5a' },
                ].map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ width: 14, fontSize: 10, fontWeight: 800, color: '#9f927d' }}>{r.label}</span>
                    <div style={{ flex: 1, height: 10, background: '#ece3cf', borderRadius: 50 }}>
                      <div style={{ width: `${info.feature.awayTeamAwayScoreRatio}%`, height: '100%', background: r.color, borderRadius: 50, minWidth: r.value ? 4 : 0 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 900, color: r.color, width: 18, textAlign: 'right' }}>{r.value}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>场均进 {info.feature.awayTeamAvgGoals} / 失 {info.feature.awayTeamAvgLossGoals}</div>
              </div>
            </div>
          </div>

          {/* 近期状态 */}
          {info.result && (
            <>
              <SecH>近期状态</SecH>
              <div className="card">
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  {[
                    { name: mm.homeTeamName, r: { wins: info.result.homeTeamWins, draws: info.result.homeTeamDraws, losses: info.result.homeTeamLosses, winRate: info.result.homeTeamWinRate } },
                    { name: mm.awayTeamName, r: { wins: info.result.awayTeamWins, draws: info.result.awayTeamDraws, losses: info.result.awayTeamLosses, winRate: info.result.awayTeamWinRate } },
                  ].map((team, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontWeight: 900, fontSize: 11, color: '#794f27', marginBottom: 6 }}>{team.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <div><div style={{ fontWeight: 900, fontSize: 18, color: '#11a89b' }}>{team.r.wins}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#9f927d' }}>胜</div></div>
                        <div><div style={{ fontWeight: 900, fontSize: 18, color: '#a07e08' }}>{team.r.draws}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#9f927d' }}>平</div></div>
                        <div><div style={{ fontWeight: 900, fontSize: 18, color: '#e05a5a' }}>{team.r.losses}</div><div style={{ fontSize: 9, fontWeight: 700, color: '#9f927d' }}>负</div></div>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 10, fontWeight: 800, color: '#11a89b' }}>胜率 {team.r.winRate}%</div>
                    </div>
                  ))}
                </div>
                {info.resultDetails?.slice(0, 6).map((r, i) => <RecentRow key={i} r={r} />)}
              </div>
            </>
          )}

          {/* 伤停名单 */}
          {info.injuries?.length > 0 && (
            <>
              <SecH>伤停名单</SecH>
              <div className="card">
                {info.injuries.map((inj, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < info.injuries.length - 1 ? '1.5px dashed #e6ddc6' : 'none' }}>
                    <span className={'chip' + (inj.teamType === 'home' ? ' mint' : '')} style={{ fontSize: 10, padding: '2px 8px', flex: 'none' }}>
                      {inj.teamType === 'home' ? mm.homeTeamName.slice(0, 4) : mm.awayTeamName.slice(0, 4)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 900, fontSize: 13, color: '#794f27' }}>{inj.playerName}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginLeft: 6 }}>{inj.position} · #{inj.jerseyNumber}</span>
                    </div>
                    {inj.isInjured && <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fff0f0', color: '#e05a5a', border: '1.5px solid #f8c8c8' }}>伤</span>}
                    {inj.isSuspended && <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fdf3cf', color: '#a07e08', border: '1.5px solid #f4e29a' }}>停</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* AI 分析 */}
      <SecH>AI 竞彩分析</SecH>
      <div className="card">
        {!analysis && !aiLoading && !aiErr && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginBottom: 14, lineHeight: 1.6 }}>
              结合实时赔率走势、历史交锋、主客场特征与近期状态，AI 将给出竞彩选购建议。
            </div>
            <button className="btn btn-mint btn-block" onClick={runAnalysis} disabled={aiLoading}>
              🤖 开始 AI 分析
            </button>
          </>
        )}
        {aiLoading && reasoning && (
          <div style={{ marginBottom: 14, padding: 14, maxHeight: 200, overflowY: 'auto', background: '#faf6ee', borderRadius: 14, border: '2px solid #e6ddc6' }}>
            <span className="chip mint" style={{ marginBottom: 8, display: 'inline-block' }}>🤖 AI 思考中…</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#725d42', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {reasoning}<span style={{ animation: 'blink 1s steps(1) infinite' }}>▋</span>
            </div>
          </div>
        )}
        {aiLoading && !reasoning && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#9f927d', fontWeight: 800 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
            AI 分析中…
          </div>
        )}
        {aiErr && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e05a5a', marginBottom: 10 }}>分析失败: {aiErr}</div>
            <button className="btn btn-primary btn-block btn-sm" onClick={runAnalysis}>重试</button>
          </div>
        )}
        {analysis && (
          <>
            {/* 结构化 picks 展示 (优先) */}
            {analysis.picks?.length > 0 ? (
              <PicksPanel picks={analysis.picks} />
            ) : (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
                {analysis.suggestions?.map((s, i) => (
                  <span key={i} className="chip green" style={{ fontSize: 11 }}>{s}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#725d42', lineHeight: 1.75, marginBottom: 14 }}>
              {analysis.reasoning}
            </div>
            {analysis.confidence != null && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="chip mint">置信度 {analysis.confidence}%</span>
                {analysis.recommendation && (
                  <span className="chip yellow">推荐: {analysis.recommendation}</span>
                )}
              </div>
            )}
            <button className="btn btn-primary btn-block btn-sm" style={{ marginTop: 14 }} onClick={runAnalysis} disabled={aiLoading}>
              ↻ 重新分析
            </button>
          </>
        )}
      </div>

      <div style={{ height: 8 }} />
    </div>
  );
}

/* ── 结构化注单面板 ── */
function PicksPanel({ picks }) {
  const tiers = ['稳健', '均衡', '博胆'];
  const grouped = {};
  for (const p of picks) {
    const t = p.tier || 'unknown';
    (grouped[t] = grouped[t] || []).push(p);
  }
  const orderedKeys = [...tiers.filter((t) => grouped[t]), ...Object.keys(grouped).filter((t) => !tiers.includes(t))];
  return (
    <div style={{ marginBottom: 12 }}>
      {orderedKeys.map((tier) => {
        const ts = tierStyle(tier);
        return (
          <div key={tier} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{ts.emoji}</span>
              <span style={{ fontWeight: 900, fontSize: 13, color: ts.color }}>{tier}档</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{grouped[tier].length} 注</span>
            </div>
            {grouped[tier].map((pick, i) => (
              <div key={i} style={{
                background: ts.bg, border: `1.5px solid ${ts.border}`, borderRadius: 14,
                padding: '10px 12px', marginBottom: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fff', border: `1.5px solid ${ts.border}` }}>
                    {POOL_LABEL[pick.poolCode] || pick.poolCode}
                  </span>
                  <span style={{ fontWeight: 900, fontSize: 14, color: ts.color }}>{pick.optionLabel}</span>
                  {pick.odds != null && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#794f27' }}>@ {pick.odds}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: pick.reason ? 4 : 0 }}>
                  {pick.modelProbability != null && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d' }}>概率 {(pick.modelProbability * 100).toFixed(0)}%</span>
                  )}
                  {pick.ev != null && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: pick.ev > 0 ? '#6fba2c' : '#e05a5a' }}>EV {pick.ev > 0 ? '+' : ''}{pick.ev.toFixed(2)}</span>
                  )}
                  {pick.stakeFraction != null && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#9f927d' }}>仓位 {(pick.stakeFraction * 100).toFixed(0)}%</span>
                  )}
                </div>
                {pick.reason && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#725d42', lineHeight: 1.6 }}>{pick.reason}</div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ── 解析赔率快照 raw 数据为 { optionCode: odds } ── */
function parsePoolSnapshot(rawList, poolCode) {
  if (!rawList?.length) return {};
  const result = {};
  // 每条 raw 可能是对象或有不同格式，尝试通用解析
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    // 格式1: { optionCode, odds } 或 { option, odds }
    const code = item.optionCode || item.option || item.code || '';
    const odds = item.odds ?? item.currentOdds;
    if (code && odds != null) {
      result[code] = odds;
      if (item.optionLabel) result[item.optionLabel] = odds;
    }
    // 格式2: CRS 快照可能直接用比分做 key
    for (const [k, v] of Object.entries(item)) {
      if (typeof v === 'number' || (typeof v === 'string' && /^\d+\.\d+$/.test(v))) {
        if (!result[k] && k !== 'updateTime' && k !== 'capturedAt') result[k] = v;
      }
    }
  }
  return result;
}

/* ── 竞彩战绩页 ── */
export function LotteryAccuracyScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.lotteryAccuracy()
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="screen pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ fontSize: 44 }}>🎯</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#9f927d' }}>加载竞彩战绩…</div>
    </div>
  );

  if (err) return (
    <div className="screen pop">
      <div className="card" style={{ textAlign: 'center', padding: 30, color: '#e05a5a', fontWeight: 800 }}>加载失败: {err}</div>
    </div>
  );

  if (!data?.length) return (
    <div className="screen pop">
      <SecH>竞彩战绩</SecH>
      <div className="card" style={{ textAlign: 'center', padding: 30 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#9f927d' }}>暂无已对账的竞彩注单</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#c4b89e', marginTop: 6 }}>比赛结束后将自动对账 AI 注单</div>
      </div>
    </div>
  );

  // 聚合
  const totalGraded = data.reduce((s, b) => s + b.graded, 0);
  const totalHit = data.reduce((s, b) => s + b.hit, 0);
  const totalProfit = data.reduce((s, b) => s + b.profit, 0);
  const totalHitRate = totalGraded ? Math.round((totalHit / totalGraded) * 100) : 0;
  const totalRoi = totalGraded ? Math.round((totalProfit / totalGraded) * 1000) / 10 : 0;

  // 按 tier 聚合
  const byTier = {};
  for (const b of data) {
    const t = b.tier || 'unknown';
    if (!byTier[t]) byTier[t] = { graded: 0, hit: 0, profit: 0 };
    byTier[t].graded += b.graded;
    byTier[t].hit += b.hit;
    byTier[t].profit += b.profit;
  }

  // 按 poolCode 聚合
  const byPool = {};
  for (const b of data) {
    const p = b.poolCode || 'unknown';
    if (!byPool[p]) byPool[p] = { graded: 0, hit: 0, profit: 0 };
    byPool[p].graded += b.graded;
    byPool[p].hit += b.hit;
    byPool[p].profit += b.profit;
  }

  // 按 model 聚合
  const byModel = {};
  for (const b of data) {
    const m = `${b.provider}/${b.model}`;
    if (!byModel[m]) byModel[m] = { graded: 0, hit: 0, profit: 0 };
    byModel[m].graded += b.graded;
    byModel[m].hit += b.hit;
    byModel[m].profit += b.profit;
  }

  const renderBucketRow = (label, bucket, color) => {
    const hitRate = bucket.graded ? Math.round((bucket.hit / bucket.graded) * 100) : 0;
    const roi = bucket.graded ? Math.round((bucket.profit / bucket.graded) * 1000) / 10 : 0;
    return (
      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1.5px dashed #e6ddc6' }}>
        <span style={{ fontWeight: 900, fontSize: 12, color: color || '#794f27', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', width: 50, textAlign: 'center' }}>{bucket.hit}/{bucket.graded}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: '#11a89b', width: 40, textAlign: 'right' }}>{hitRate}%</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: roi >= 0 ? '#6fba2c' : '#e05a5a', width: 50, textAlign: 'right' }}>
          {roi >= 0 ? '+' : ''}{roi}%
        </span>
      </div>
    );
  };

  return (
    <div className="screen pop">
      {/* 总览 */}
      <SecH>总览</SecH>
      <div className="card" style={{ padding: 18, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#11a89b', lineHeight: 1 }}>{totalGraded}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>已对账注单</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#f5c31c', lineHeight: 1 }}>{totalHit}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>命中</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#794f27', lineHeight: 1 }}>{totalHitRate}%</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>命中率</div>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 900, color: totalRoi >= 0 ? '#6fba2c' : '#e05a5a', lineHeight: 1 }}>
              {totalRoi >= 0 ? '+' : ''}{totalRoi}%
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9f927d', marginTop: 4 }}>ROI</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', borderRadius: 14, border: '2px dashed #e6ddc6' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#725d42' }}>
            累计盈亏 <b style={{ color: totalProfit >= 0 ? '#6fba2c' : '#e05a5a', fontSize: 15 }}>
              {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
            </b> 单位
          </span>
        </div>
      </div>

      {/* 按档位 */}
      <SecH>按策略档位</SecH>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginBottom: 4 }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 800, color: '#c4b89e' }}>档位</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'center' }}>命中/总</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 40, textAlign: 'right' }}>命中率</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'right' }}>ROI</span>
        </div>
        {['稳健', '均衡', '博胆'].filter((t) => byTier[t]).map((t) => {
          const ts = tierStyle(t);
          return renderBucketRow(`${ts.emoji} ${t}`, byTier[t], ts.color);
        })}
        {Object.keys(byTier).filter((t) => !['稳健', '均衡', '博胆'].includes(t)).map((t) =>
          renderBucketRow(t, byTier[t])
        )}
      </div>

      {/* 按玩法 */}
      <SecH>按玩法</SecH>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginBottom: 4 }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 800, color: '#c4b89e' }}>玩法</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'center' }}>命中/总</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 40, textAlign: 'right' }}>命中率</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'right' }}>ROI</span>
        </div>
        {POOL_CODES.filter((c) => byPool[c]).map((c) =>
          renderBucketRow(POOL_LABEL[c], byPool[c])
        )}
      </div>

      {/* 按模型 */}
      {Object.keys(byModel).length > 1 && (
        <>
          <SecH>按模型</SecH>
          <div className="card" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginBottom: 4 }}>
              <span style={{ flex: 1, fontSize: 10, fontWeight: 800, color: '#c4b89e' }}>模型</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'center' }}>命中/总</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 40, textAlign: 'right' }}>命中率</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b89e', width: 50, textAlign: 'right' }}>ROI</span>
            </div>
            {Object.entries(byModel).map(([m, b]) =>
              renderBucketRow(`🤖 ${m}`, b)
            )}
          </div>
        </>
      )}
    </div>
  );
}
