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
} as const;

export type Config = typeof config;
