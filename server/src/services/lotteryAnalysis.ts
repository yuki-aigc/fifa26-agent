/* ===========================================================
   竞彩 AI 分析服务
   输入: 单场 Firo API 完整数据 (赔率 + 走势 + 情报)
   输出: AI 建议 (推荐玩法 + 理由 + 置信度)
   =========================================================== */
import { completeSimple, streamSimple, type Context } from '@earendil-works/pi-ai';
import { resolveModel, aiKeyAvailable, aiInfo, aiRequestOptions } from '../ai/pi.js';
import type { FiroMatchItem, FiroFootballInfo, FiroOddsHistory } from '../ingest/sources/firoApi.js';
import { aiLogger } from '../observability/logger.js';
import { recordAiAnalysis } from '../observability/metrics.js';

export interface LotteryAnalysisResult {
  matchId: number;
  suggestions: string[];
  recommendation: string;
  confidence: number;
  reasoning: string;
  model: string;
  provider: string;
  picks?: LotteryPickSuggestion[];
}

export interface LotteryPickSuggestion {
  tier: '稳健' | '均衡' | '博胆' | string;
  poolCode: string;
  optionCode?: string;
  optionLabel: string;
  odds?: number | null;
  modelProbability?: number | null;
  ev?: number | null;
  stakeFraction?: number | null;
  reason: string;
}

const SYSTEM_PROMPT = `你是一名专业的竞彩足球数据分析师，擅长分析中国体育彩票竞彩赛事。
你会收到一场竞彩比赛的实时赔率、赔率走势、双方历史交锋数据、主客场表现、近期状态和伤停情报。
请综合以上信息，给出针对竞彩各玩法（胜平负/让球/半全场/总进球/比分）的专业购买建议。
建议必须尽量结构化为注单 picks，并按「稳健/均衡/博胆」标注档位；没有模型概率或 EV 时可填 null。
务必通过 submit_lottery_analysis 工具返回结构化结果。所有文本用简体中文。`;

function buildPrompt(
  match: FiroMatchItem,
  info: FiroFootballInfo,
  oddsHistory: FiroOddsHistory,
): string {
  const mm = match.matchMain;
  const had = match.matchOddsList?.find((o) => o.poolCode === 'HAD');
  const hhad = match.matchOddsList?.find((o) => o.poolCode === 'HHAD');
  const pools = match.matchPoolList || [];
  const sellingPools = pools.filter((p) => p.poolStatus === 'Selling').map((p) => p.poolCode).join(', ');

  // 赔率走势摘要 (最近 3 条 HAD)
  const hadTrend = oddsHistory.hadOddsList?.slice(-3).map((r) => {
    const h = r.homeWinFlag === 1 ? '↑' : r.homeWinFlag === -1 ? '↓' : '-';
    const d = r.drawFlag === 1 ? '↑' : r.drawFlag === -1 ? '↓' : '-';
    const a = r.awayWinFlag === 1 ? '↑' : r.awayWinFlag === -1 ? '↓' : '-';
    return `  ${r.updateTime?.slice(11, 16) || '--'}: 主${r.homeWinOdds}${h} 平${r.drawOdds}${d} 客${r.awayWinOdds}${a}`;
  }).join('\n') || '  暂无走势数据';

  const hhadTrend = oddsHistory.hhadOddsList?.slice(-3).map((r) => {
    return `  ${r.updateTime?.slice(11, 16) || '--'}(让${r.goalLine || '?'}): 主${r.homeWinOdds} 平${r.drawOdds} 客${r.awayWinOdds}`;
  }).join('\n') || '  暂无走势数据';

  const inj = info.injuries?.length
    ? info.injuries.map((i) => `${i.teamType === 'home' ? mm.homeTeamName : mm.awayTeamName}: ${i.playerName}(${i.position}${i.isInjured ? '/伤' : ''}${i.isSuspended ? '/停' : ''})`).join(', ')
    : '无缺阵';

  return `【竞彩比赛信息】
场次: ${mm.matchNumStr}  联赛: ${mm.leagueName}  时间: ${mm.matchDate} ${mm.matchTime}
${mm.homeTeamName}(主) vs ${mm.awayTeamName}(客)
开售玩法: ${sellingPools || '未知'}

【实时赔率】
胜平负: 主${had?.homeOdds ?? '-'} 平${had?.drawOdds ?? '-'} 客${had?.awayOdds ?? '-'}
让球(${hhad?.goalLine ?? '?'}): 主${hhad?.homeOdds ?? '-'} 平${hhad?.drawOdds ?? '-'} 客${hhad?.awayOdds ?? '-'}

【赔率走势(近3条)】
胜平负走势:
${hadTrend}
让球走势:
${hhadTrend}

【历史交锋(共${info.history.totalMatches}场)】
${mm.homeTeamName}胜${info.history.wins} 平${info.history.draws} ${mm.awayTeamName}胜${info.history.losses}
胜率${info.history.winRate}% / 平${info.history.drawRate}% / 负${info.history.lossRate}%
总进球${info.history.totalGoals} 净球${info.history.netGoals >= 0 ? '+' : ''}${info.history.netGoals}

【主客场特征】
${mm.homeTeamName}主场: 胜${info.feature.homeTeamHomeWins}平${info.feature.homeTeamHomeDraws}负${info.feature.homeTeamHomeLosses} 进球率${info.feature.homeTeamHomeScoreRatio}% 场均进${info.feature.homeTeamAvgGoals}/失${info.feature.homeTeamAvgLossGoals}
${mm.awayTeamName}客场: 胜${info.feature.awayTeamAwayWins}平${info.feature.awayTeamAwayDraws}负${info.feature.awayTeamAwayLosses} 进球率${info.feature.awayTeamAwayScoreRatio}% 场均进${info.feature.awayTeamAvgGoals}/失${info.feature.awayTeamAvgLossGoals}

【近期状态】
${mm.homeTeamName}: 近期${info.result.homeTeamWins}胜${info.result.homeTeamDraws}平${info.result.homeTeamLosses}负 胜率${info.result.homeTeamWinRate}% 进${info.result.homeTeamTotalGoals}失${info.result.homeTeamTotalLossGoals}
${mm.awayTeamName}: 近期${info.result.awayTeamWins}胜${info.result.awayTeamDraws}平${info.result.awayTeamLosses}负 胜率${info.result.awayTeamWinRate}% 进${info.result.awayTeamTotalGoals}失${info.result.awayTeamTotalLossGoals}

【伤停名单】
${inj}

请基于以上信息，通过 submit_lottery_analysis 工具给出竞彩购买分析。`;
}

const analysisToolDef = {
  name: 'submit_lottery_analysis',
  description: '提交竞彩分析结果，包含购买建议、推荐玩法与理由。',
  parameters: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: '具体选购建议列表，如 ["胜平负: 主胜", "让球: 主让胜"]，最多5条',
      },
      recommendation: {
        type: 'string',
        description: '核心推荐一句话，如"主胜大概率，建议单关主胜或串关"',
      },
      confidence: {
        type: 'number',
        description: '对本次分析的置信度，0-100 的整数',
      },
      reasoning: {
        type: 'string',
        description: '详细分析理由，200字以内，结合赔率走势、历史数据说明',
      },
      picks: {
        type: 'array',
        description: '结构化注单建议。没有 EV 或模型概率时相关字段可省略。',
        items: {
          type: 'object',
          properties: {
            tier: { type: 'string', description: '稳健/均衡/博胆' },
            poolCode: { type: 'string', description: '玩法代码，如 HAD/HHAD/HAFU/TTG/CRS' },
            optionCode: { type: 'string', description: '选项代码，如 HOME/DRAW/AWAY 或比分' },
            optionLabel: { type: 'string', description: '用户可读选项，如 主胜、让球平、2:1' },
            odds: { type: 'number', description: '十进制赔率，未知可省略' },
            modelProbability: { type: 'number', description: '模型概率 0-1，未知可省略' },
            ev: { type: 'number', description: '期望收益，未知可省略' },
            stakeFraction: { type: 'number', description: '建议本金比例，未知可省略' },
            reason: { type: 'string', description: '该注单建议理由' },
          },
          required: ['tier', 'poolCode', 'optionLabel', 'reason'],
        },
      },
    },
    required: ['suggestions', 'recommendation', 'confidence', 'reasoning'],
  },
};

interface LotteryAnalysisToolCall {
  type: string;
  name?: string;
  arguments?: unknown;
}

function maybeNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parsePicks(v: unknown): LotteryPickSuggestion[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((p) => ({
      tier: String(p.tier ?? 'unknown'),
      poolCode: String(p.poolCode ?? p.playType ?? ''),
      optionCode: p.optionCode == null ? undefined : String(p.optionCode),
      optionLabel: String(p.optionLabel ?? p.selection ?? ''),
      odds: maybeNumber(p.odds),
      modelProbability: maybeNumber(p.modelProbability),
      ev: maybeNumber(p.ev),
      stakeFraction: maybeNumber(p.stakeFraction),
      reason: String(p.reason ?? ''),
    }))
    .filter((p) => p.poolCode && p.optionLabel && p.reason)
    .slice(0, 8);
}

export function parseLotteryAnalysisToolCall(
  content: LotteryAnalysisToolCall[],
  matchId: number,
): LotteryAnalysisResult | null {
  const call = content.find((c) => c.type === 'toolCall' && c.name === analysisToolDef.name);
  if (!call || !call.arguments || typeof call.arguments !== 'object') return null;

  const args = call.arguments as Record<string, unknown>;
  const picks = parsePicks(args.picks);
  const suggestions = Array.isArray(args.suggestions)
    ? args.suggestions.slice(0, 5).map(String)
    : picks.slice(0, 5).map((p) => `${p.poolCode}: ${p.optionLabel}`);
  return {
    matchId,
    suggestions,
    recommendation: typeof args.recommendation === 'string' ? args.recommendation : '',
    confidence: Math.max(0, Math.min(100, Math.round(Number(args.confidence ?? 50)))),
    reasoning: typeof args.reasoning === 'string' ? args.reasoning : '',
    model: aiInfo.model,
    provider: aiInfo.provider,
    picks,
  };
}

function tokensUsed(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const usage = (result as { usage?: Record<string, unknown> }).usage;
  if (!usage) return 0;
  return Number(usage.totalTokens ?? usage.total_tokens ?? 0) || 0;
}

export async function analyzeLotteryMatch(
  match: FiroMatchItem,
  info: FiroFootballInfo,
  oddsHistory: FiroOddsHistory,
): Promise<LotteryAnalysisResult | null> {
  const startedAt = Date.now();
  const matchId = match.matchMain.matchId;
  if (!aiKeyAvailable()) {
    recordAiAnalysis(Date.now() - startedAt, false);
    aiLogger.warn({ matchId }, 'ai_analysis_key_missing');
    return null;
  }
  const model = resolveModel();
  if (!model) {
    recordAiAnalysis(Date.now() - startedAt, false);
    aiLogger.warn({ matchId, provider: aiInfo.provider, model: aiInfo.model }, 'ai_analysis_model_unresolved');
    return null;
  }

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(match, info, oddsHistory), timestamp: Date.now() }],
    tools: [analysisToolDef],
  };

  try {
    aiLogger.info({ matchId, provider: aiInfo.provider, model: aiInfo.model }, 'ai_analysis_start');
    const result = await completeSimple(model, context, aiRequestOptions());
    const parsed = parseLotteryAnalysisToolCall(result.content as LotteryAnalysisToolCall[], matchId);
    const durationMs = Date.now() - startedAt;
    recordAiAnalysis(durationMs, !!parsed, tokensUsed(result));
    if (!parsed) {
      aiLogger.warn({ matchId, durationMs }, 'ai_analysis_tool_call_missing');
      return null;
    }
    aiLogger.info({ matchId, durationMs, confidence: parsed.confidence }, 'ai_analysis_done');
    return parsed;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    recordAiAnalysis(durationMs, false);
    aiLogger.error({ matchId, durationMs, err }, 'ai_analysis_failed');
    return null;
  }
}

/* ── 流式竞彩分析 (SSE 用) ──────────────────────────── */

export type LotteryStreamEvent =
  | { type: 'thinking'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'analysis'; analysis: LotteryAnalysisResult }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function* streamLotteryAnalysis(
  match: FiroMatchItem,
  info: FiroFootballInfo,
  oddsHistory: FiroOddsHistory,
): AsyncGenerator<LotteryStreamEvent> {
  const matchId = match.matchMain.matchId;
  if (!aiKeyAvailable()) {
    yield { type: 'error', message: 'AI 密钥未配置' };
    return;
  }
  const model = resolveModel();
  if (!model) {
    yield { type: 'error', message: '无法解析 AI 模型' };
    return;
  }

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(match, info, oddsHistory), timestamp: Date.now() }],
    tools: [analysisToolDef],
  };

  try {
    const eventStream = streamSimple(model, context, aiRequestOptions());
    for await (const event of eventStream) {
      switch (event.type) {
        case 'thinking_delta':
          yield { type: 'thinking', delta: event.delta };
          break;
        case 'text_delta':
          yield { type: 'text', delta: event.delta };
          break;
        case 'toolcall_end': {
          const call = event.toolCall;
          if (call.name !== analysisToolDef.name) break;
          const parsed = parseLotteryAnalysisToolCall(
            [{ type: 'toolCall', name: call.name, arguments: call.arguments }],
            matchId,
          );
          if (parsed) yield { type: 'analysis', analysis: parsed };
          break;
        }
        case 'done':
          yield { type: 'done' };
          break;
        case 'error':
          yield { type: 'error', message: String((event.error as any)?.message ?? 'AI 流式错误') };
          break;
      }
    }
  } catch (err) {
    yield { type: 'error', message: (err as Error).message };
  }
}
