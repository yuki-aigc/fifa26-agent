/* ===========================================================
   竞彩屏幕: 赛程列表 + 单场详情 (数据来自 Firo API)
   =========================================================== */
import { useState, useEffect } from 'react';
import { api } from '../data/api.js';
import { SecH } from '../components/ui.jsx';

const POOL_LABEL = { HAD: '胜平负', HHAD: '让球', HAFU: '半全场', TTG: '总进球', CRS: '比分' };
const POOL_CODES = ['HAD', 'HHAD', 'HAFU', 'TTG', 'CRS'];

/* 赔率单元: value + 升降箭头 */
function OddsCell({ label, value, flag, big }) {
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
export function LotteryScreen({ onOpenMatch }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.lotteryMatches()
      .then(setMatches)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
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

  const sellingCount = matches.filter(m => m.matchMain.matchStatus === 'Selling').length;

  return (
    <div className="screen pop">
      <SecH>竞彩赛程</SecH>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <span className="chip mint">{sellingCount} 场在售</span>
        <span className="chip">{matches.length} 场合计</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {matches.map((m) => {
          const mm = m.matchMain;
          const had = m.matchOddsList?.find((o) => o.poolCode === 'HAD');
          const hhad = m.matchOddsList?.find((o) => o.poolCode === 'HHAD');
          const sellingPools = (m.matchPoolList || []).filter((p) => p.poolStatus === 'Selling').map((p) => p.poolCode);
          const isSelling = mm.matchStatus === 'Selling';

          return (
            <div key={mm.matchId} className={'card press' + (isSelling ? '' : '')} onClick={() => onOpenMatch(m)}
              style={{ padding: 14, opacity: isSelling ? 1 : 0.72 }}>
              {/* 头部: 联赛 + 场次号 + 时间 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="chip" style={{ fontSize: 10, padding: '3px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mm.leagueShort || mm.leagueName}
                </span>
                <span style={{ fontWeight: 900, fontSize: 12, color: '#11a89b' }}>{mm.matchNumStr}</span>
                <span style={{ fontWeight: 700, fontSize: 11, color: '#9f927d' }}>
                  {mm.matchDate?.slice(5)} {mm.matchTime}
                </span>
              </div>

              {/* 球队名 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hhad ? 10 : 0 }}>
                {mm.homeTeamBadgeUrl && (
                  <img src={mm.homeTeamBadgeUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #e6ddc6', flex: 'none' }}
                    onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <span style={{ fontWeight: 900, fontSize: 14, color: '#794f27', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mm.homeTeamName}</span>
                <span style={{ fontWeight: 800, fontSize: 12, color: '#c4b89e', flex: 'none' }}>VS</span>
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

  useEffect(() => {
    api.lotteryMatch(mm.matchId)
      .then(setDetail)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [mm.matchId]);

  const had = match.matchOddsList?.find((o) => o.poolCode === 'HAD');
  const hhad = match.matchOddsList?.find((o) => o.poolCode === 'HHAD');
  const pools = match.matchPoolList || [];
  const isSelling = (code) => pools.find((p) => p.poolCode === code)?.poolStatus === 'Selling';

  const runAnalysis = () => {
    setAiLoading(true);
    setAiErr(null);
    api.lotteryAnalysis(mm.matchId)
      .then(setAnalysis)
      .catch((e) => setAiErr(e.message))
      .finally(() => setAiLoading(false));
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
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9f927d' }}>{mm.matchDate} {mm.matchTime}</span>
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
            <div style={{ fontSize: 26, fontWeight: 900, color: '#c4b89e', letterSpacing: '0.1em' }}>VS</div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {['HAD', 'HHAD'].map((code) => (
          <button key={code} onClick={() => setOddsTab(code)}
            className="chip"
            style={{
              cursor: 'pointer', border: 'none',
              background: oddsTab === code ? '#19c8b9' : '#fff',
              color: oddsTab === code ? '#fff' : '#8a7b66',
              boxShadow: oddsTab === code ? '0 3px 0 0 #11a89b' : '0 2px 0 0 #e6ddc6',
              padding: '7px 18px',
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
      {!loading && oddsHistory && (
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
        {!analysis && !aiLoading && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', marginBottom: 14, lineHeight: 1.6 }}>
              结合实时赔率走势、历史交锋、主客场特征与近期状态，AI 将给出竞彩选购建议。
            </div>
            <button className="btn btn-mint btn-block" onClick={runAnalysis} disabled={aiLoading}>
              🤖 开始 AI 分析
            </button>
          </>
        )}
        {aiLoading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#9f927d', fontWeight: 800 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
            AI 分析中，请稍候…
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
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
              {analysis.suggestions?.map((s, i) => (
                <span key={i} className="chip green" style={{ fontSize: 11 }}>{s}</span>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#725d42', lineHeight: 1.75, marginBottom: 14 }}>
              {analysis.reasoning}
            </div>
            {analysis.confidence && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
