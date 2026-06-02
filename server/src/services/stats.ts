/* ===========================================================
   比赛表现数据 (match_stats) · 读写 + 球队场均聚合
   来源: API-Football /fixtures/statistics (sync 写入)。
   作为 AI 分析的重要因素: 真实控球/射门/xG 表现。
   =========================================================== */
import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matchStats, matches } from '../db/schema.js';
import type { MatchStatsRow } from '../db/schema.js';

export type MatchStatInput = Omit<MatchStatsRow, 'id' | 'updatedAt'>;

/** 单场双方的表现数据 (主队在前)。 */
export async function getMatchStats(matchId: string): Promise<MatchStatsRow[]> {
  return db
    .select()
    .from(matchStats)
    .where(eq(matchStats.matchId, matchId))
    .orderBy(desc(matchStats.isHome));
}

/** 按 (matchId, teamCode) upsert 一行表现数据。 */
export async function upsertMatchStats(row: MatchStatInput): Promise<void> {
  const { matchId, teamCode, ...rest } = row;
  await db
    .insert(matchStats)
    .values({ matchId, teamCode, ...rest, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [matchStats.matchId, matchStats.teamCode],
      set: { ...rest, updatedAt: new Date() },
    });
}

export interface StatAverages {
  matches: number; // 有统计数据的场次
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  xg: number | null;
}

/** 球队在已有统计数据的场次里的场均表现 (供 AI 提示词 / 详情页)。 */
export async function teamStatAverages(code: string): Promise<StatAverages> {
  const rows = await db
    .select()
    .from(matchStats)
    .where(eq(matchStats.teamCode, code));
  if (rows.length === 0) return { matches: 0, possession: null, shots: null, shotsOnTarget: null, xg: null };

  const avg = (pick: (r: MatchStatsRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };

  return {
    matches: rows.length,
    possession: avg((r) => r.possession),
    shots: avg((r) => r.shots),
    shotsOnTarget: avg((r) => r.shotsOnTarget),
    xg: avg((r) => r.xg),
  };
}

/**
 * 距上一场已完赛比赛的间隔天数（整数，向下取整）。
 * beforeKickoff: 即将开赛的比赛时间。返回 null 表示没有历史完赛记录。
 */
export async function getTeamRestDays(teamCode: string, beforeKickoff: Date): Promise<number | null> {
  const all = await db
    .select({ kickoff: matches.kickoff, homeCode: matches.homeCode, awayCode: matches.awayCode })
    .from(matches)
    .where(and(eq(matches.status, 'finished'), isNotNull(matches.kickoff), lt(matches.kickoff, beforeKickoff)))
    .orderBy(desc(matches.kickoff));

  const prev = all.find((m) => m.homeCode === teamCode || m.awayCode === teamCode);
  if (!prev?.kickoff) return null;
  return Math.floor((beforeKickoff.getTime() - prev.kickoff.getTime()) / (1000 * 60 * 60 * 24));
}

/** 已结束且有比分的场次 (派生战绩/对账复用)。 */
export async function finishedMatchesForTeam(code: string) {
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.status, 'finished'), isNotNull(matches.homeScore), isNotNull(matches.awayScore)))
    .orderBy(desc(matches.kickoff));
  return rows.filter((m) => m.homeCode === code || m.awayCode === code);
}
