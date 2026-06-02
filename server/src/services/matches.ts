import { and, asc, eq, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches } from '../db/schema.js';
import type { Match } from '../domain/types.js';
import { getTeamRow } from './teams.js';
import { getMatchStats } from './stats.js';
import { getLatestOdds } from './odds.js';

export function teamMini(t: { code: string; name: string; en: string; flagEmoji: string | null; accent: string; ovr: number }) {
  return { code: t.code, name: t.name, en: t.en, flagEmoji: t.flagEmoji, accent: t.accent, ovr: t.ovr };
}

export async function listMatches(opts: { status?: string; group?: string } = {}): Promise<Match[]> {
  const conds: SQL[] = [];
  if (opts.status) conds.push(eq(matches.status, opts.status));
  if (opts.group) conds.push(eq(matches.group, opts.group));
  const where = conds.length ? and(...conds) : undefined;
  return db.select().from(matches).where(where).orderBy(asc(matches.kickoff));
}

export async function getMatchRow(id: string): Promise<Match | undefined> {
  const rows = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return rows[0];
}

/** 比赛 + 双方球队 (含 mini 视图); 找不到返回 undefined。 */
export async function getMatchWithTeams(id: string) {
  const match = await getMatchRow(id);
  if (!match) return undefined;
  const [home, away] = await Promise.all([getTeamRow(match.homeCode), getTeamRow(match.awayCode)]);
  if (!home || !away) return undefined;
  return { match, home, away };
}

export function matchView(match: Match, home: { code: string; name: string; en: string; flagEmoji: string | null; accent: string; ovr: number }, away: typeof home) {
  return {
    id: match.id,
    stage: match.stage,
    group: match.group,
    venue: match.venue,
    kickoff: match.kickoff,
    status: match.status,
    elapsed: match.elapsed, // 比赛进行分钟 (live)
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    home: teamMini(home),
    away: teamMini(away),
  };
}

/** 单场详情 = 基础视图 + 双方表现数据 + 最新赔率 (供详情页/iOS)。 */
export async function matchDetail(id: string) {
  const mwt = await getMatchWithTeams(id);
  if (!mwt) return undefined;
  const [stats, latestOdds] = await Promise.all([getMatchStats(id), getLatestOdds(id)]);
  return {
    ...matchView(mwt.match, mwt.home, mwt.away),
    stats, // match_stats 行 (主队在前), 无数据为 []
    odds: latestOdds, // 最新盘口 + 隐含概率, 无则 null
  };
}
