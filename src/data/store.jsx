/* ===========================================================
   全局数据 store · 启动时从后端加载 球队/赛程/球员
   通过 React context 提供给所有屏幕。
   =========================================================== */
import { createContext, useContext, useEffect, useState } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { api } from './api.js';
import { useMatchEvents } from './sse.js';

const DataContext = createContext(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData 必须在 <DataProvider> 内使用');
  return ctx;
}

export function DataProvider({ children }) {
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState({ core: 'idle', players: 'idle' });
  const [errors, setErrors] = useState({ core: null, players: null });
  const corePromise = useRef(null);
  const playersPromise = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const loadCore = useCallback((opts = {}) => {
    if (!opts.force && statusRef.current.core === 'ready') return Promise.resolve();
    if (!opts.force && corePromise.current) return corePromise.current;

    setStatus((s) => ({ ...s, core: 'loading' }));
    setErrors((e) => ({ ...e, core: null }));

    corePromise.current = Promise.all([api.teams(), api.matches()])
      .then(([nextTeams, nextMatches]) => {
        setTeams(nextTeams);
        setMatches(nextMatches);
        setStatus((s) => ({ ...s, core: 'ready' }));
      })
      .catch((err) => {
        setErrors((e) => ({ ...e, core: err.message }));
        setStatus((s) => ({ ...s, core: 'error' }));
      })
      .finally(() => {
        corePromise.current = null;
      });

    return corePromise.current;
  }, []);

  const loadPlayers = useCallback((opts = {}) => {
    if (!opts.force && statusRef.current.players === 'ready') return Promise.resolve();
    if (!opts.force && playersPromise.current) return playersPromise.current;

    setStatus((s) => ({ ...s, players: 'loading' }));
    setErrors((e) => ({ ...e, players: null }));

    playersPromise.current = api.players()
      .then((nextPlayers) => {
        setPlayers(nextPlayers);
        setStatus((s) => ({ ...s, players: 'ready' }));
      })
      .catch((err) => {
        setErrors((e) => ({ ...e, players: err.message }));
        setStatus((s) => ({ ...s, players: 'error' }));
      })
      .finally(() => {
        playersPromise.current = null;
      });

    return playersPromise.current;
  }, []);

  const byCode = useMemo(() => {
    const grouped = {};
    for (const t of teams) grouped[t.code] = { ...t, squad: [] };
    for (const p of players) {
      const bucket = grouped[p.team.code];
      if (bucket) bucket.squad.push(p);
    }
    for (const code of Object.keys(grouped)) grouped[code].squad.sort((a, b) => b.ovr - a.ovr);
    return grouped;
  }, [teams, players]);

  useMatchEvents(useCallback((event) => {
    if (!event.matchId || !event.data) return;
    const patch = {};
    if (event.data.homeScore != null) patch.homeScore = event.data.homeScore;
    if (event.data.awayScore != null) patch.awayScore = event.data.awayScore;
    if (event.data.status) patch.status = event.data.status;
    if (event.data.elapsed != null) patch.elapsed = event.data.elapsed;
    if (Object.keys(patch).length === 0) return;
    setMatches((prev) => prev.map((m) => m.id === event.matchId ? { ...m, ...patch } : m));
  }, []));

  const value = {
    teams,
    matches,
    players,
    byCode,
    coreReady: status.core === 'ready',
    playersReady: status.players === 'ready',
    loading: status.core === 'loading' || status.players === 'loading',
    error: errors.core || errors.players,
    coreStatus: status.core,
    playersStatus: status.players,
    coreError: errors.core,
    playersError: errors.players,
    loadCore,
    loadPlayers,
    retryCore: () => loadCore({ force: true }),
    retryPlayers: () => loadPlayers({ force: true }),
    apiBase: api.base,
  };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
