import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { lotteryAnalyses, lotteryOddsSnapshots, lotteryPicks, matches } from '../db/schema.js';
import type { LotteryPickRow, MatchRow } from '../db/schema.js';

type Outcome = 'HOME' | 'DRAW' | 'AWAY';

export interface LotteryAccuracyBucket {
  provider: string;
  model: string;
  poolCode: string;
  tier: string;
  graded: number;
  hit: number;
  hitRate: number;
  profit: number;
  roi: number;
}

function actualOutcome(match: MatchRow): Outcome | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  if (match.homeScore > match.awayScore) return 'HOME';
  if (match.homeScore < match.awayScore) return 'AWAY';
  return 'DRAW';
}

function normalizeOutcomeOption(pick: LotteryPickRow): Outcome | null {
  const raw = `${pick.optionCode} ${pick.optionLabel}`.toUpperCase();
  if (raw.includes('HOME') || raw.includes('主胜')) return 'HOME';
  if (raw.includes('DRAW') || raw.includes('平')) return 'DRAW';
  if (raw.includes('AWAY') || raw.includes('客胜')) return 'AWAY';
  return null;
}

function pickGoalLine(pick: LotteryPickRow): number | null {
  const rawLine = (pick.raw as { goalLine?: unknown })?.goalLine;
  const fromRaw = typeof rawLine === 'number' ? rawLine : typeof rawLine === 'string' && rawLine !== '' ? Number(rawLine) : NaN;
  if (Number.isFinite(fromRaw)) return fromRaw;
  const text = `${pick.optionCode} ${pick.optionLabel} ${pick.reason}`;
  const match = text.match(/[（(]\s*([+-]?\d+(?:\.\d+)?)\s*[）)]|让\s*([+-]?\d+(?:\.\d+)?)/);
  const parsed = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(parsed) ? parsed : null;
}

function gradeHad(match: MatchRow, pick: LotteryPickRow): boolean | null {
  const actual = actualOutcome(match);
  const selected = normalizeOutcomeOption(pick);
  return actual && selected ? actual === selected : null;
}

function gradeHhad(match: MatchRow, pick: LotteryPickRow): boolean | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  const line = pickGoalLine(pick);
  if (line == null) return null;
  const adjustedHome = match.homeScore + line;
  const actual: Outcome = adjustedHome > match.awayScore ? 'HOME' : adjustedHome < match.awayScore ? 'AWAY' : 'DRAW';
  const selected = normalizeOutcomeOption(pick);
  return selected ? actual === selected : null;
}

function gradeTtg(match: MatchRow, pick: LotteryPickRow): boolean | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  const total = match.homeScore + match.awayScore;
  const raw = `${pick.optionCode} ${pick.optionLabel}`;
  const range = raw.match(/(\d+)\s*[-~到至]\s*(\d+)/);
  if (range) return total >= Number(range[1]) && total <= Number(range[2]);
  const plus = raw.match(/(\d+)\s*\+/);
  if (plus) return total >= Number(plus[1]);
  const n = raw.match(/\d+/);
  return n ? total === Number(n[0]) : null;
}

function gradeCrs(match: MatchRow, pick: LotteryPickRow): boolean | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  const raw = `${pick.optionCode} ${pick.optionLabel}`;
  const score = raw.match(/(\d+)\s*[:：-]\s*(\d+)/);
  if (!score) return null;
  return match.homeScore === Number(score[1]) && match.awayScore === Number(score[2]);
}

export function gradeLotteryPick(match: MatchRow, pick: LotteryPickRow): boolean | null {
  switch (pick.poolCode) {
    case 'HAD':
      return gradeHad(match, pick);
    case 'HHAD':
      return gradeHhad(match, pick);
    case 'TTG':
      return gradeTtg(match, pick);
    case 'CRS':
      return gradeCrs(match, pick);
    default:
      return null;
  }
}

export async function gradeLotteryMatch(matchId: string): Promise<number> {
  const match = (await db.select().from(matches).where(eq(matches.id, matchId)).limit(1))[0];
  if (!match || match.status !== 'finished' || match.homeScore == null || match.awayScore == null) return 0;

  const picks = await db.select().from(lotteryPicks).where(eq(lotteryPicks.matchId, matchId));
  let graded = 0;
  const touchedAnalyses = new Set<number>();
  for (const pick of picks) {
    const enriched = pick.poolCode === 'HHAD' && pickGoalLine(pick) == null
      ? await withLatestGoalLine(pick)
      : pick;
    const hit = gradeLotteryPick(match, enriched);
    if (hit == null) continue;
    const profit = pick.odds && pick.odds > 0 ? (hit ? pick.odds - 1 : -1) : null;
    await db
      .update(lotteryPicks)
      .set({ isHit: hit, profitOneUnit: profit, gradedAt: new Date() })
      .where(eq(lotteryPicks.id, pick.id));
    touchedAnalyses.add(pick.analysisId);
    graded++;
  }

  for (const analysisId of touchedAnalyses) await refreshAnalysisRoi(analysisId);
  return graded;
}

async function withLatestGoalLine(pick: LotteryPickRow): Promise<LotteryPickRow> {
  const line = (await db
    .select({ goalLine: lotteryOddsSnapshots.goalLine })
    .from(lotteryOddsSnapshots)
    .where(and(eq(lotteryOddsSnapshots.firoMatchId, pick.firoMatchId), eq(lotteryOddsSnapshots.poolCode, 'HHAD')))
    .orderBy(desc(lotteryOddsSnapshots.updateTime))
    .limit(1))[0]?.goalLine;
  return line ? { ...pick, raw: { ...(pick.raw as object), goalLine: line } } : pick;
}

export async function gradeAllLotteryFinished(): Promise<number> {
  const finished = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.status, 'finished'), isNotNull(matches.homeScore)));
  let total = 0;
  for (const match of finished) total += await gradeLotteryMatch(match.id);
  return total;
}

async function refreshAnalysisRoi(analysisId: number): Promise<void> {
  const picks = await db.select().from(lotteryPicks).where(eq(lotteryPicks.analysisId, analysisId));
  const graded = picks.filter((p) => p.gradedAt && p.profitOneUnit != null);
  if (!graded.length) return;
  const profit = graded.reduce((sum, p) => sum + (p.profitOneUnit ?? 0), 0);
  await db
    .update(lotteryAnalyses)
    .set({ roiOneUnit: profit / graded.length, gradedAt: new Date() })
    .where(eq(lotteryAnalyses.id, analysisId));
}

export async function lotteryAccuracySummary(): Promise<LotteryAccuracyBucket[]> {
  const rows = await db
    .select({
      pick: lotteryPicks,
      analysis: lotteryAnalyses,
    })
    .from(lotteryPicks)
    .innerJoin(lotteryAnalyses, eq(lotteryPicks.analysisId, lotteryAnalyses.id))
    .where(isNotNull(lotteryPicks.gradedAt));

  const byKey = new Map<string, LotteryAccuracyBucket>();
  for (const row of rows) {
    const key = [
      row.analysis.provider,
      row.analysis.model,
      row.pick.poolCode,
      row.pick.tier,
    ].join('|');
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        provider: row.analysis.provider,
        model: row.analysis.model,
        poolCode: row.pick.poolCode,
        tier: row.pick.tier,
        graded: 0,
        hit: 0,
        hitRate: 0,
        profit: 0,
        roi: 0,
      };
      byKey.set(key, bucket);
    }
    bucket.graded++;
    if (row.pick.isHit) bucket.hit++;
    bucket.profit += row.pick.profitOneUnit ?? 0;
  }

  const out = [...byKey.values()];
  for (const bucket of out) {
    bucket.hitRate = bucket.graded ? Math.round((bucket.hit / bucket.graded) * 100) : 0;
    bucket.profit = Math.round(bucket.profit * 100) / 100;
    bucket.roi = bucket.graded ? Math.round((bucket.profit / bucket.graded) * 1000) / 1000 : 0;
  }
  return out.sort((a, b) => b.roi - a.roi);
}
