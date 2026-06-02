import { beforeEach, describe, expect, it } from 'vitest';
import {
  addLotteryMatchesServed,
  metricsSnapshot,
  recordAiAnalysis,
  recordFiroRequest,
  recordHttpRequest,
  resetMetricsForTest,
} from './metrics.js';

describe('metricsSnapshot', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it('records HTTP, Firo, AI and lottery counters', () => {
    recordHttpRequest('GET', '/health', 200, 12);
    recordHttpRequest('GET', '/api/fail', 500, 30);
    recordFiroRequest(80, true);
    recordFiroRequest(120, false);
    recordAiAnalysis(1500, true, 321);
    addLotteryMatchesServed(4);

    const snapshot = metricsSnapshot();
    expect(snapshot.http_requests_total['GET /health:200']).toBe(1);
    expect(snapshot.http_errors_total).toBe(1);
    expect(snapshot.firo_requests_total).toBe(2);
    expect(snapshot.firo_errors_total).toBe(1);
    expect(snapshot.ai_analysis_total).toBe(1);
    expect(snapshot.ai_tokens_used_total).toBe(321);
    expect(snapshot.lottery_matches_served).toBe(4);
  });
});
