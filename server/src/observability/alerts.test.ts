import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateAlertStatus } from './alerts.js';
import { metricsSnapshot, recordAiAnalysis, recordFiroRequest, resetMetricsForTest } from './metrics.js';

describe('evaluateAlertStatus', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it('marks Firo unhealthy when enough samples exceed error-rate threshold', () => {
    for (let i = 0; i < 5; i++) recordFiroRequest(20, i < 2);

    const alerts = evaluateAlertStatus(metricsSnapshot());
    expect(alerts.firo.ok).toBe(false);
    expect(alerts.firo.errorRate).toBe(0.6);
  });

  it('marks AI unhealthy when average duration exceeds threshold', () => {
    recordAiAnalysis(13000, true);

    const alerts = evaluateAlertStatus(metricsSnapshot());
    expect(alerts.ai.ok).toBe(false);
  });
});
