/* ===========================================================
   pi (@earendil-works/pi-ai) 封装 · 提供者无关
   通过 AI_PROVIDER / AI_MODEL 选择 anthropic 或 openai (或任意 pi 提供者)。
   API key 默认由 pi-ai 自动从环境变量读取 (ANTHROPIC_API_KEY / OPENAI_API_KEY);
   也支持 AI_BASE_URL (自定义端点) 与 AI_API_KEY (显式覆盖 key)。
   =========================================================== */
import { getModel, getEnvApiKey, type Model, type Api, type SimpleStreamOptions } from '@earendil-works/pi-ai';
import { config } from '../config.js';

/** 当前所选提供者是否有可用的 API key (显式 AI_API_KEY 或提供者环境变量)。 */
export function aiKeyAvailable(): boolean {
  if (config.ai.apiKey) return true;
  try {
    return !!getEnvApiKey(config.ai.provider as never);
  } catch {
    return false;
  }
}

/** 解析配置的模型并应用自定义 baseUrl; 失败时返回 null,让上层回退到 Elo。 */
export function resolveModel(): Model<Api> | null {
  try {
    // getModel 在类型层面要求已知 provider/model;运行期接受字符串。
    // 注意: 未知的 provider/model 会返回 undefined (而非抛错)。
    const known = getModel(config.ai.provider as never, config.ai.model as never) as
      | Model<Api>
      | undefined;
    if (known) {
      if (config.ai.baseUrl) known.baseUrl = config.ai.baseUrl; // 覆盖端点 (代理 / 自托管 / 兼容网关)
      return known;
    }
    // 模型不在 pi-ai 内置目录 (如经 OpenAI 兼容网关接入 Qwen/DeepSeek)。
    // 必须提供 baseUrl 才能知道去哪里调用。
    if (!config.ai.baseUrl) {
      console.warn(
        `[ai] 未知模型 ${config.ai.provider}/${config.ai.model} 且未设置 AI_BASE_URL,回退到 Elo。`,
      );
      return null;
    }
    return buildCustomModel();
  } catch (err) {
    console.warn(`[ai] 无法解析模型 ${config.ai.provider}/${config.ai.model}:`, (err as Error).message);
    return null;
  }
}

/** 为 OpenAI 兼容网关 (DashScope / DeepSeek / 自托管等) 构造自定义模型。 */
function buildCustomModel(): Model<Api> {
  return {
    id: config.ai.model,
    name: config.ai.model,
    api: config.ai.api as Api, // 默认 openai-completions (chat completions),兼容绝大多数网关
    provider: config.ai.provider,
    baseUrl: config.ai.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

/** 传给 completeSimple 的请求选项 (显式 key 覆盖)。 */
export function aiRequestOptions(): SimpleStreamOptions {
  return config.ai.apiKey ? { apiKey: config.ai.apiKey } : {};
}

export const aiInfo = {
  provider: config.ai.provider,
  model: config.ai.model,
  baseUrl: config.ai.baseUrl || null,
};
