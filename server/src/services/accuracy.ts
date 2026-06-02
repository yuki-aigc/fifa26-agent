/* ===========================================================
   预测对账 · 比赛结束后用真实比分给缓存预测打分
   - correctOutcome: 胜平负是否命中 (取胜平负概率最大者为预测结果)
   - correctScore:  精确比分是否命中
   并聚合 AI / Elo 各自命中率, 供 /api/accuracy 展示系统可信度。
   =========================================================== */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches, predictions } from '../db/schema.js';
import type { PredictionRow } from '../db/schema.js';

type Outcome = 'home' | 'draw' | 'away';

function actualOutcome(hs: number, as: number): Outcome {
  return hs > as ? 'home' : hs === as ? 'draw' : 'away';
}

function predictedOutcome(p: Pick<PredictionRow, 'win' | 'draw' | 'loss'>): Outcome {
  if (p.win >= p.draw && p.win >= p.loss) return 'home';
  if (p.draw >= p.loss) return 'draw';
  return 'away';
}

/** 给单场已结束比赛的所有预测打分。返回打分条数。 */
export async function gradeMatch(matchId: string): Promise<number> {
  const m = (await db.select().from(matches).where(eq(matches.id, matchId)))[0];
  if (!m || m.status !== 'finished' || m.homeScore == null || m.awayScore == null) return 0;

  const actual = actualOutcome(m.homeScore, m.awayScore);
  const rows = await db.select().from(predictions).where(eq(predictions.matchId, matchId));
  let graded = 0;
  for (const p of rows) {
    const correctOutcome = predictedOutcome(p) === actual;
    const correctScore = p.predScoreHome === m.homeScore && p.predScoreAway === m.awayScore;
    await db
      .update(predictions)
      .set({ correctOutcome, correctScore, gradedAt: new Date() })
      .where(eq(predictions.id, p.id));
    graded++;
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
  model: string | null;
  graded: number;
  outcomeHit: number; // 胜平负命中数
  scoreHit: number; // 精确比分命中数
  outcomeRate: number; // %
  scoreRate: number; // %
}

/** 按 engine(+model) 聚合命中率。 */
export async function accuracySummary(): Promise<EngineAccuracy[]> {
  const rows = await db.select().from(predictions).where(isNotNull(predictions.gradedAt));
  const byKey = new Map<string, EngineAccuracy>();
  for (const p of rows) {
    const key = `${p.engine}|${p.model ?? ''}`;
    let e = byKey.get(key);
    if (!e) {
      e = { engine: p.engine, model: p.model, graded: 0, outcomeHit: 0, scoreHit: 0, outcomeRate: 0, scoreRate: 0 };
      byKey.set(key, e);
    }
    e.graded++;
    if (p.correctOutcome) e.outcomeHit++;
    if (p.correctScore) e.scoreHit++;
  }
  const out = [...byKey.values()];
  for (const e of out) {
    e.outcomeRate = e.graded ? Math.round((e.outcomeHit / e.graded) * 100) : 0;
    e.scoreRate = e.graded ? Math.round((e.scoreHit / e.graded) * 100) : 0;
  }
  return out.sort((a, b) => b.outcomeRate - a.outcomeRate);
}
