import { config } from '../config.js';
import type { MetricsSnapshot } from './metrics.js';

export function evaluateAlertStatus(snapshot: MetricsSnapshot) {
  const firoErrorRate = snapshot.firo_requests_total === 0
    ? 0
    : snapshot.firo_errors_total / snapshot.firo_requests_total;
  const firoThreshold = config.observability.alertFiroErrorRate;
  const aiThresholdMs = config.observability.alertAiDurationMs;

  return {
    firo: {
      ok: snapshot.firo_requests_total < 5 || firoErrorRate < firoThreshold,
      errorRate: Math.round(firoErrorRate * 1000) / 1000,
      threshold: firoThreshold,
      sampleSize: snapshot.firo_requests_total,
    },
    ai: {
      ok: snapshot.ai_avg_duration_ms < aiThresholdMs,
      avgDurationMs: snapshot.ai_avg_duration_ms,
      thresholdMs: aiThresholdMs,
    },
  };
}
