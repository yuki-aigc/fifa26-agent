import { useEffect, useRef } from 'react';

export function useMatchEvents(onEvent) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
    const es = new EventSource(`${BASE}/api/events/matches`);
    es.onmessage = (e) => {
      try {
        cb.current(JSON.parse(e.data));
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, []);
}
