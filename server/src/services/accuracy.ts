/* ===========================================================
   预测对账 · 比赛结束后用真实比分给缓存预测打分
   - correctOutcome: 胜平负是否命中 (取胜平负概率最大者为预测结果)
   - correctScore:  精确比分是否命中
   并聚合 AI / Elo 各自命中率, 供 /api/accuracy 展示系统可信度。
   =========================================================== */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches, predictionRuns, predictions } from '../db/schema.js';
import type { PredictionRow, PredictionRunRow } from '../db/schema.js';

type Outcome = 'home' | 'draw' | 'away';
type OutcomeProbabilities = Pick<PredictionRow, 'win' | 'draw' | 'loss'> | Pick<PredictionRunRow, 'win' | 'draw' | 'loss'>;

function actualOutcome(hs: number, as: number): Outcome {
  return hs > as ? 'home' : hs === as ? 'draw' : 'away';
}

function predictedOutcome(p: OutcomeProbabilities): Outcome {
  if (p.win >= p.draw && p.win >= p.loss) return 'home';
  if (p.draw >= p.loss) return 'draw';
  return 'away';
}

function outcomeProbability(p: OutcomeProbabilities, outcome: Outcome): number {
  const total = Math.max(1, p.win + p.draw + p.loss);
  if (outcome === 'home') return p.win / total;
  if (outcome === 'draw') return p.draw / total;
  return p.loss / total;
}

function brierScore(p: OutcomeProbabilities, outcome: Outcome): number {
  const total = Math.max(1, p.win + p.draw + p.loss);
  const probs = {
    home: p.win / total,
    draw: p.draw / total,
    away: p.loss / total,
  };
  return (['home', 'draw', 'away'] as Outcome[])
    .reduce((sum, key) => sum + (probs[key] - (key === outcome ? 1 : 0)) ** 2, 0);
}

function logLoss(p: OutcomeProbabilities, outcome: Outcome): number {
  const prob = Math.max(0.001, Math.min(0.999, outcomeProbability(p, outcome)));
  return -Math.log(prob);
}

/** 给单场已结束比赛的所有预测打分。返回打分条数。 */
export async function gradeMatch(matchId: string): Promise<number> {
  const m = (await db.select().from(matches).where(eq(matches.id, matchId)))[0];
  if (!m || m.status !== 'finished' || m.homeScore == null || m.awayScore == null) return 0;

  const actual = actualOutcome(m.homeScore, m.awayScore);
  const runRows = await db
    .select()
    .from(predictionRuns)
    .where(and(
      eq(predictionRuns.matchId, matchId),
      eq(predictionRuns.eligibleForAccuracy, true),
      eq(predictionRuns.isLatestEligible, true),
    ));
  let graded = 0;
  for (const p of runRows) {
    const correctOutcome = predictedOutcome(p) === actual;
    const correctScore = p.predScoreHome === m.homeScore && p.predScoreAway === m.awayScore;
    await db
      .update(predictionRuns)
      .set({
        correctOutcome,
        correctScore,
        brierScore: brierScore(p, actual),
        logLoss: logLoss(p, actual),
        gradedAt: new Date(),
      })
      .where(eq(predictionRuns.id, p.id));
    graded++;
  }

  // 兼容旧缓存表: 仍给每场缓存预测打分, 供旧字段/页面读取。
  const cacheRows = await db.select().from(predictions).where(eq(predictions.matchId, matchId));
  for (const p of cacheRows) {
    const correctOutcome = predictedOutcome(p) === actual;
    const correctScore = p.predScoreHome === m.homeScore && p.predScoreAway === m.awayScore;
    await db
      .update(predictions)
      .set({ correctOutcome, correctScore, gradedAt: new Date() })
      .where(eq(predictions.id, p.id));
  }
  return graded;
}

/** 给所有已结束但尚未打分的比赛批量打分。返回打分条数。 */
export async function gradeAllFinished(): Promise<number> {
  const finished = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.status, 'finished'), isNotNull(matches.homeScore)));
  let total = 0;
  for (const m of finished) total += await gradeMatch(m.id);
  return total;
}

export interface EngineAccuracy {
  engine: string;
  provider: string | null;
  model: string | null;
  graded: number;
  outcomeHit: number; // 胜平负命中数
  scoreHit: number; // 精确比分命中数
  outcomeRate: number; // %
  scoreRate: number; // %
  avgBrierScore: number | null;
  avgLogLoss: number | null;
}

/** 按 engine/provider/model 聚合最后一次赛前预测命中率。 */
export async function accuracySummary(): Promise<EngineAccuracy[]> {
  const rows = await db
    .select()
    .from(predictionRuns)
    .where(and(
      eq(predictionRuns.eligibleForAccuracy, true),
      eq(predictionRuns.isLatestEligible, true),
      isNotNull(predictionRuns.gradedAt),
    ));
  const byKey = new Map<string, EngineAccuracy>();
  const sums = new Map<string, { brier: number; brierN: number; logLoss: number; logLossN: number }>();
  for (const p of rows) {
    const key = `${p.engine}|${p.provider ?? ''}|${p.model ?? ''}`;
    let e = byKey.get(key);
    if (!e) {
      e = {
        engine: p.engine,
        provider: p.provider,
        model: p.model,
        graded: 0,
        outcomeHit: 0,
        scoreHit: 0,
        outcomeRate: 0,
        scoreRate: 0,
        avgBrierScore: null,
        avgLogLoss: null,
      };
      byKey.set(key, e);
      sums.set(key, { brier: 0, brierN: 0, logLoss: 0, logLossN: 0 });
    }
    e.graded++;
    if (p.correctOutcome) e.outcomeHit++;
    if (p.correctScore) e.scoreHit++;
    const sum = sums.get(key)!;
    if (p.brierScore != null) {
      sum.brier += p.brierScore;
      sum.brierN++;
    }
    if (p.logLoss != null) {
      sum.logLoss += p.logLoss;
      sum.logLossN++;
    }
  }
  const out = [...byKey.values()];
  for (const e of out) {
    e.outcomeRate = e.graded ? Math.round((e.outcomeHit / e.graded) * 100) : 0;
    e.scoreRate = e.graded ? Math.round((e.scoreHit / e.graded) * 100) : 0;
    const sum = sums.get(`${e.engine}|${e.provider ?? ''}|${e.model ?? ''}`);
    e.avgBrierScore = sum?.brierN ? Math.round((sum.brier / sum.brierN) * 1000) / 1000 : null;
    e.avgLogLoss = sum?.logLossN ? Math.round((sum.logLoss / sum.logLossN) * 1000) / 1000 : null;
  }
  return out.sort((a, b) => b.outcomeRate - a.outcomeRate);
}
