import 'dotenv/config';

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(env('PORT', '8787')),
  host: env('HOST', '0.0.0.0'),
  databaseUrl: env('DATABASE_URL', './data/fifa26.sqlite'),

  ai: {
    provider: env('AI_PROVIDER', 'anthropic'),
    model: env('AI_MODEL', 'claude-sonnet-4-5'),
    baseUrl: env('AI_BASE_URL'), // 空 = 用提供者默认端点
    apiKey: env('AI_API_KEY'), // 空 = 用提供者标准环境变量 key
    // 当 model 不在 pi-ai 内置目录时 (如经 OpenAI 兼容网关接入 Qwen/DeepSeek 等),
    // 用此 api 构造自定义模型。默认 chat completions,兼容绝大多数网关。
    api: env('AI_API', 'openai-completions'),
  },

  apiFootball: {
    key: env('API_FOOTBALL_KEY'),
    leagueId: env('API_FOOTBALL_LEAGUE_ID', '1'),
    season: env('API_FOOTBALL_SEASON', '2026'),
  },

  firo: {
    apiKey: env('FIRO_API_KEY'),
    privateKey: env('FIRO_PRIVATE_KEY'), // PKCS#8 DER base64
  },

  observability: {
    logLevel: env('LOG_LEVEL', 'info'),
    feishuWebhookUrl: env('FEISHU_WEBHOOK_URL'),
    alertFiroErrorRate: Number(env('ALERT_FIRO_ERROR_RATE', '0.3')),
    alertAiDurationMs: Number(env('ALERT_AI_DURATION_MS', '12000')),
  },

  // server 内置定时同步 (赛事期间开启)。需 API_FOOTBALL_KEY 才会真正运行。
  sync: {
    enabled: env('SYNC_ENABLED', 'false') === 'true',
    intervalMin: Number(env('SYNC_INTERVAL_MIN', '5')),
    mode: env('SYNC_MODE', 'live') as 'full' | 'live', // live=仅进行中(省额度) / full=全季
    stats: env('SYNC_STATS', 'true') === 'true',
    odds: env('SYNC_ODDS', 'true') === 'true',
    firoEnabled: env('FIRO_SYNC_ENABLED', 'false') === 'true',
    firoIntervalMin: Number(env('FIRO_SYNC_INTERVAL_MIN', '30')),
    firoDays: Number(env('FIRO_SYNC_DAYS', '2')),
    firoDetailTtlMin: Number(env('FIRO_DETAIL_TTL_MIN', '10')),
  },
} as const;

export type Config = typeof config;
