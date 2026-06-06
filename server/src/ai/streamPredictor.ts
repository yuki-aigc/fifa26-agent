import { streamSimple, type Context, type ToolCall } from '@earendil-works/pi-ai';
import type { Team, Player, Prediction, Odds, ScorePrediction, Factor, H2H } from '../domain/types.js';
import type { TeamRecord } from '../services/standings.js';
import type { StatAverages } from '../services/stats.js';
import type { InjuryRow } from '../db/schema.js';
import { resolveModel, aiKeyAvailable, aiInfo, aiRequestOptions } from './pi.js';
import { predictMatchTool, type PredictMatchArgs } from './predictTool.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import type { Baseline } from './predictor.js';

export type StreamEvent =
  | { type: 'thinking'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'prediction'; prediction: Prediction }
  | { type: 'done' }
  | { type: 'error'; message: string };

function normalizeOdds(win: number, draw: number, loss: number): Odds {
  const w = Math.max(0, win);
  const d = Math.max(0, draw);
  const l = Math.max(0, loss);
  const sum = w + d + l || 1;
  let nw = Math.round((w / sum) * 100);
  let nd = Math.round((d / sum) * 100);
  let nl = 100 - nw - nd;
  if (nl < 0) { nd += nl; nl = 0; }
  return { win: nw, draw: nd, loss: nl };
}

const clampGoals = (n: unknown): number => Math.max(0, Math.min(9, Math.round(Number(n ?? 0)) || 0));
const clampPct = (n: unknown): number => Math.max(0, Math.min(100, Math.round(Number(n ?? 0)) || 0));

export async function* streamPredictWithAI(args: {
  home: Team;
  away: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  stage: string;
  baseline: Baseline;
  homeRecord?: TeamRecord;
  awayRecord?: TeamRecord;
  homeStats?: StatAverages;
  awayStats?: StatAverages;
  oddsLine?: string;
  homeInjuries?: InjuryRow[];
  awayInjuries?: InjuryRow[];
  homeRestDays?: number | null;
  awayRestDays?: number | null;
}): AsyncGenerator<StreamEvent> {
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
    messages: [{ role: 'user', content: buildUserPrompt(args), timestamp: Date.now() }],
    tools: [predictMatchTool],
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
          if (call.name !== predictMatchTool.name) break;
          const a = call.arguments as Partial<PredictMatchArgs>;
          const odds = normalizeOdds(Number(a.win ?? 0), Number(a.draw ?? 0), Number(a.loss ?? 0));
          yield {
            type: 'prediction',
            prediction: {
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
            },
          };
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
