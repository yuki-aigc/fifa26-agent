/* ===========================================================
   App 根组件 · 导航栈 + 底部 Tab (数据来自后端 API)
   =========================================================== */
import { useState, useEffect } from 'react';
import { DataProvider, useData } from './data/store.jsx';
import { Header } from './components/ui.jsx';
import {
  MatchesScreen,
  MatchDetailScreen,
  TeamsScreen,
  TeamDetailScreen,
  PlayersScreen,
  PlayerDetailScreen,
} from './screens/Screens.jsx';

function StatusBar() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => { const d = new Date(); setT(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  return (
    <div className="statusbar">
      <span>{t}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: '#11a89b', letterSpacing: '0.06em' }}>🏆 FIFA26</span>
      <span className="dots"><span /><span /><span style={{ background: 'transparent' }} /><span className="bat" /></span>
    </div>
  );
}

function TabBar({ tab, onTab }) {
  const items = [
    { k: 'matches', label: '赛程', ic: '⚽' },
    { k: 'teams', label: '球队', ic: '🛡️' },
    { k: 'players', label: '球员', ic: '👤' },
  ];
  return (
    <div className="tabbar">
      {items.map((it) => (
        <button key={it.k} className={'tab' + (tab === it.k ? ' active' : '')} onClick={() => onTab(it.k)}>
          <span className="ic">{it.ic}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function Splash({ error, apiBase }) {
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>{error ? '⚠️' : '⚽'}</div>
      {error ? (
        <>
          <div style={{ fontWeight: 900, fontSize: 16, color: '#e05a5a' }}>无法连接后端</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9f927d', maxWidth: 280 }}>{error}</div>
          <div style={{ fontSize: 11, color: '#c4b89e', marginTop: 4 }}>API: {apiBase}<br />请确认后端已启动 (cd server &amp;&amp; pnpm dev)</div>
        </>
      ) : (
        <div style={{ fontWeight: 800, fontSize: 14, color: '#9f927d' }}>加载FIFA26数据中…</div>
      )}
    </div>
  );
}

function Shell() {
  const { byCode, loading, error, apiBase } = useData();
  const [tab, setTab] = useState('matches');
  const [stack, setStack] = useState([]);

  const push = (v) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => s.slice(0, -1));
  const switchTab = (k) => { setTab(k); setStack([]); };

  const cur = stack[stack.length - 1] || null;
  const ready = !loading && !error && byCode;

  let title = 'FIFA26';
  let sub = '2026 · 美加墨';
  let content = <Splash error={error} apiBase={apiBase} />;
  const onBack = stack.length ? back : null;

  if (ready) {
    if (!cur) {
      if (tab === 'matches') { title = 'FIFA26'; sub = '2026 · 美加墨'; content = <MatchesScreen onOpenMatch={(m) => push({ type: 'match', match: m })} />; }
      if (tab === 'teams') { title = '球队分析'; sub = '48强实力数据'; content = <TeamsScreen onOpenTeam={(c) => push({ type: 'team', code: c })} />; }
      if (tab === 'players') { title = '球员能力'; sub = '面板属性 · 五维雷达'; content = <PlayersScreen onOpenPlayer={(pl) => push({ type: 'player', player: pl })} />; }
    } else if (cur.type === 'match') {
      title = '比赛预测'; sub = cur.match.stage;
      content = <MatchDetailScreen match={cur.match} onOpenTeam={(c) => push({ type: 'team', code: c })} />;
    } else if (cur.type === 'team') {
      title = byCode[cur.code]?.name ?? '球队'; sub = byCode[cur.code]?.en ?? '';
      content = <TeamDetailScreen code={cur.code} onOpenPlayer={(pl) => push({ type: 'player', player: pl })} />;
    } else if (cur.type === 'player') {
      title = '球员详情'; sub = cur.player.team.name;
      content = <PlayerDetailScreen player={cur.player} />;
    }
  }

  return (
    <div className="phone">
      <StatusBar />
      <Header title={title} sub={sub} onBack={onBack} />
      {content}
      {ready && !cur && <TabBar tab={tab} onTab={switchTab} />}
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
