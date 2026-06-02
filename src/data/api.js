/* ===========================================================
   后端 API 客户端
   端点基址由 VITE_API_BASE 配置 (默认 http://localhost:8787)。
   =========================================================== */
const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

export const api = {
  base: BASE,
  health: () => get('/health'),
  teams: () => get('/api/teams').then((d) => d.teams),
  team: (code) => get(`/api/teams/${code}`),
  players: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.position) q.set('position', opts.position);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return get('/api/players' + (qs ? `?${qs}` : '')).then((d) => d.players);
  },
  matches: () => get('/api/matches').then((d) => d.matches),
  prediction: (id, { ai = false, refresh = false } = {}) =>
    get(`/api/matches/${id}/prediction?ai=${ai ? 1 : 0}${refresh ? '&refresh=1' : ''}`),

  lotteryMatches: () => get('/api/lottery/matches').then((d) => d.matches),
  lotteryMatch: (id) => get(`/api/lottery/matches/${id}`),
  lotteryAnalysis: (id) => get(`/api/lottery/matches/${id}/analysis`),
};
