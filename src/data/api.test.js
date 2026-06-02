import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns lottery matches from the backend payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ matchMain: { matchId: 1 } }] }),
    });

    await expect(api.lotteryMatches()).resolves.toEqual([{ matchMain: { matchId: 1 } }]);
  });

  it('throws a readable error when backend response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'firo_not_configured' }),
    });

    await expect(api.lotteryMatches()).rejects.toThrow('/api/lottery/matches -> HTTP 503');
  });
});
