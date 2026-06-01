/* ===========================================================
   全局数据 store · 启动时从后端加载 球队/赛程/球员
   通过 React context 提供给所有屏幕。
   =========================================================== */
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const DataContext = createContext(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData 必须在 <DataProvider> 内使用');
  return ctx;
}

export function DataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [teams, matches, players] = await Promise.all([api.teams(), api.matches(), api.players()]);
        // byCode: 球队 + 附带 squad (按综合排序)
        const byCode = {};
        for (const t of teams) byCode[t.code] = { ...t, squad: [] };
        for (const p of players) {
          const bucket = byCode[p.team.code];
          if (bucket) bucket.squad.push(p);
        }
        for (const code of Object.keys(byCode)) byCode[code].squad.sort((a, b) => b.ovr - a.ovr);
        if (alive) setState({ loading: false, error: null, data: { teams, matches, players, byCode } });
      } catch (err) {
        if (alive) setState({ loading: false, error: err.message, data: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = { ...state.data, loading: state.loading, error: state.error, apiBase: api.base };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
