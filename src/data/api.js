/* ===========================================================
   后端 API 客户端
   端点基址由 VITE_API_BASE 配置 (默认 http://localhost:8787)。
   =========================================================== */
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function get(path, opts = {}) {
  const res = await fetch(BASE + path, opts.signal ? { signal: opts.signal } : undefined);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

export const api = {
  base: BASE,
  health: (opts) => get('/health', opts),
  teams: (opts) => get('/api/teams', opts).then((d) => d.teams),
  team: (code, opts) => get(`/api/teams/${code}`, opts),
  players: (opts = {}) => {
    const q = new URLSearchParams();
    if (opts.position) q.set('position', opts.position);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return get('/api/players' + (qs ? `?${qs}` : ''), opts).then((d) => d.players);
  },
  matches: (opts) => get('/api/matches', opts).then((d) => d.matches),
  prediction: (id, { ai = false, refresh = false, signal } = {}) =>
    get(`/api/matches/${id}/prediction?ai=${ai ? 1 : 0}${refresh ? '&refresh=1' : ''}`, { signal }),

  predictionStream: (id, { refresh = false, onEvent, signal } = {}) => {
    return new Promise((resolve, reject) => {
      const url = `${BASE}/api/matches/${id}/prediction/stream?ai=1${refresh ? '&refresh=1' : ''}`;
      const es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEvent(event);
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            resolve(event);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        reject(new Error('SSE 连接失败'));
      };
      if (signal) signal.addEventListener('abort', () => {
        es.close();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  },

  tournamentSimulation: (opts) => get('/api/tournament/simulation', opts),

  accuracy: (opts) => get('/api/accuracy', opts).then((d) => d.summary),

  lotteryMatches: (opts) => get('/api/lottery/matches', opts).then((d) => d.matches),
  lotteryMatch: (id, opts) => get(`/api/lottery/matches/${id}`, opts),
  lotteryAnalysis: (id, opts) => get(`/api/lottery/matches/${id}/analysis`, opts),

  lotteryAnalysisStream: (id, { onEvent, signal } = {}) => {
    return new Promise((resolve, reject) => {
      const url = `${BASE}/api/lottery/matches/${id}/analysis/stream`;
      const es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEvent(event);
          if (event.type === 'done' || event.type === 'error') {
            es.close();
            resolve(event);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es.close();
        reject(new Error('SSE 连接失败'));
      };
      if (signal) signal.addEventListener('abort', () => {
        es.close();
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  },
};
