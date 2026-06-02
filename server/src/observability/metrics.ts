interface AverageBucket {
  count: number;
  totalMs: number;
}

const httpRequestsTotal: Record<string, number> = {};
const httpDurations: number[] = [];

const firoDuration: AverageBucket = { count: 0, totalMs: 0 };
const aiDuration: AverageBucket = { count: 0, totalMs: 0 };

let httpErrorsTotal = 0;
let appErrorsTotal = 0;
let firoRequestsTotal = 0;
let firoErrorsTotal = 0;
let aiAnalysisTotal = 0;
let aiAnalysisErrors = 0;
let aiTokensUsedTotal = 0;
let lotteryMatchesServed = 0;
let aiCacheHits = 0;

function avg(bucket: AverageBucket): number {
  return bucket.count === 0 ? 0 : Math.round(bucket.totalMs / bucket.count);
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
  const key = `${method} ${route}:${statusCode}`;
  httpRequestsTotal[key] = (httpRequestsTotal[key] ?? 0) + 1;
  httpDurations.push(durationMs);
  if (httpDurations.length > 1000) httpDurations.shift();
  if (statusCode >= 500) httpErrorsTotal++;
}

export function recordFiroRequest(durationMs: number, ok: boolean): void {
  firoRequestsTotal++;
  firoDuration.count++;
  firoDuration.totalMs += durationMs;
  if (!ok) firoErrorsTotal++;
}

export function recordAiAnalysis(durationMs: number, ok: boolean, tokens = 0): void {
  aiAnalysisTotal++;
  aiDuration.count++;
  aiDuration.totalMs += durationMs;
  aiTokensUsedTotal += Math.max(0, Math.round(tokens));
  if (!ok) aiAnalysisErrors++;
}

export function addLotteryMatchesServed(count: number): void {
  lotteryMatchesServed += Math.max(0, count);
}

export function recordAiCacheHit(): void {
  aiCacheHits++;
}

export function recordTrackedError(): void {
  appErrorsTotal++;
}

export function metricsSnapshot() {
  const mem = process.memoryUsage();
  return {
    uptime_seconds: Math.round(process.uptime()),
    memory_rss_mb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    http_requests_total: { ...httpRequestsTotal },
    http_errors_total: httpErrorsTotal,
    app_errors_total: appErrorsTotal,
    http_p99_ms: percentile(httpDurations, 99),
    firo_requests_total: firoRequestsTotal,
    firo_errors_total: firoErrorsTotal,
    firo_avg_duration_ms: avg(firoDuration),
    ai_analysis_total: aiAnalysisTotal,
    ai_analysis_errors: aiAnalysisErrors,
    ai_tokens_used_total: aiTokensUsedTotal,
    ai_avg_duration_ms: avg(aiDuration),
    lottery_matches_served: lotteryMatchesServed,
    ai_cache_hits: aiCacheHits,
  };
}

export type MetricsSnapshot = ReturnType<typeof metricsSnapshot>;

export function resetMetricsForTest(): void {
  for (const key of Object.keys(httpRequestsTotal)) delete httpRequestsTotal[key];
  httpDurations.length = 0;
  firoDuration.count = 0;
  firoDuration.totalMs = 0;
  aiDuration.count = 0;
  aiDuration.totalMs = 0;
  httpErrorsTotal = 0;
  appErrorsTotal = 0;
  firoRequestsTotal = 0;
  firoErrorsTotal = 0;
  aiAnalysisTotal = 0;
  aiAnalysisErrors = 0;
  aiTokensUsedTotal = 0;
  lotteryMatchesServed = 0;
  aiCacheHits = 0;
}
