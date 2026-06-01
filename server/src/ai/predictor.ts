/* ===========================================================
   AI 预测器 · 用 pi 增强 Elo 基线
   组装 提示词(含 Elo 先验) -> completeSimple + 工具调用 -> 校验 -> Prediction
   任何失败 (无 key / 模型不可用 / 解析失败) 返回 null,由上层回退到 Elo。
   =========================================================== */
import { completeSimple, type Context, type ToolCall } from '@earendil-works/pi-ai';
import type { Team, Player, Prediction, Odds, ScorePrediction, Factor, H2H } from '../domain/types.js';
import { resolveModel, aiKeyAvailable, aiInfo, aiRequestOptions } from './pi.js';
import { predictMatchTool, type PredictMatchArgs } from './predictTool.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';

export interface Baseline {
  odds: Odds;
  score: ScorePrediction;
  factors: Factor[];
  h2h: H2H;
}

/** 把 win/draw/loss 归一化为整数且合计 100。 */
function normalizeOdds(win: number, draw: number, loss: number): Odds {
  const w = Math.max(0, win);
  const d = Math.max(0, draw);
  const l = Math.max(0, loss);
  const sum = w + d + l || 1;
  let nw = Math.round((w / sum) * 100);
  let nd = Math.round((d / sum) * 100);
  let nl = 100 - nw - nd;
  if (nl < 0) {
    nd += nl;
    nl = 0;
  }
  return { win: nw, draw: nd, loss: nl };
}

export async function predictWithAI(args: {
  home: Team;
  away: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  stage: string;
  baseline: Baseline;
}): Promise<Prediction | null> {
  if (!aiKeyAvailable()) return null;
  const model = resolveModel();
  if (!model) return null;

  const context: Context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(args), timestamp: Date.now() }],
    tools: [predictMatchTool],
  };

  try {
    const result = await completeSimple(model, context, aiRequestOptions());
    const call = result.content.find(
      (c): c is ToolCall => c.type === 'toolCall' && c.name === predictMatchTool.name,
    );
    if (!call) {
      console.warn('[ai] 模型未调用预测工具');
      return null;
    }
    const a = call.arguments as Partial<PredictMatchArgs>;
    const odds = normalizeOdds(Number(a.win ?? 0), Number(a.draw ?? 0), Number(a.loss ?? 0));
    return {
      engine: 'ai',
      provider: aiInfo.provider,
      model: aiInfo.model,
      win: odds.win,
      draw: odds.draw,
      loss: odds.loss,
      predScoreHome: clampGoals(a.predScoreHome),
      predScoreAway: clampGoals(a.predScoreAway),
      confidence: clampPct(a.confidence ?? Math.max(odds.win, odds.draw, odds.loss)),
      keyFactors: Array.isArray(a.keyFactors) ? a.keyFactors.slice(0, 6).map(String) : [],
      reasoning: typeof a.reasoning === 'string' ? a.reasoning : '',
    };
  } catch (err) {
    console.warn('[ai] 预测失败,回退 Elo:', (err as Error).message);
    return null;
  }
}

const clampGoals = (n: unknown): number => Math.max(0, Math.min(9, Math.round(Number(n ?? 0)) || 0));
const clampPct = (n: unknown): number => Math.max(0, Math.min(100, Math.round(Number(n ?? 0)) || 0));
