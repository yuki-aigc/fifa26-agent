/* ===========================================================
   App 根组件 · 导航栈 + 底部 Tab
   =========================================================== */
function StatusBar() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => { const d = new Date(); setT(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);
  return (
    <div className="statusbar">
      <span>{t}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: '#11a89b', letterSpacing: '0.06em' }}>🏆 WC 2026</span>
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

function App() {
  const [tab, setTab] = useState('matches');
  const [stack, setStack] = useState([]); // detail 视图栈

  const push = (v) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => s.slice(0, -1));
  const switchTab = (k) => { setTab(k); setStack([]); };

  const cur = stack[stack.length - 1] || null;

  // 标题
  let title, sub, onBack = stack.length ? back : null, content;
  if (!cur) {
    if (tab === 'matches') { title = '世界杯预测'; sub = '2026 · 美加墨'; content = <MatchesScreen onOpenMatch={(m) => push({ type: 'match', m })} />; }
    if (tab === 'teams') { title = '球队分析'; sub = '32强实力数据'; content = <TeamsScreen onOpenTeam={(c) => push({ type: 'team', code: c })} />; }
    if (tab === 'players') { title = '球员能力'; sub = '面板属性 · 五维雷达'; content = <PlayersScreen onOpenPlayer={(c, i) => push({ type: 'player', code: c, idx: i })} />; }
  } else if (cur.type === 'match') {
    title = '比赛预测'; sub = cur.m.stage;
    content = <MatchDetailScreen match={cur.m} onOpenTeam={(c) => push({ type: 'team', code: c })} />;
  } else if (cur.type === 'team') {
    title = window.WC.byCode[cur.code].name; sub = window.WC.byCode[cur.code].en;
    content = <TeamDetailScreen code={cur.code} onOpenPlayer={(c, i) => push({ type: 'player', code: c, idx: i })} />;
  } else if (cur.type === 'player') {
    title = '球员详情'; sub = window.WC.byCode[cur.code].name;
    content = <PlayerDetailScreen code={cur.code} idx={cur.idx} />;
  }

  return (
    <div className="phone">
      <StatusBar />
      <Header title={title} sub={sub} onBack={onBack} />
      {content}
      {!cur && <TabBar tab={tab} onTab={switchTab} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
