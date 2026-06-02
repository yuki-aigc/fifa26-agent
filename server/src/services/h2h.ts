/* ===========================================================
   历史交锋 (H2H) · 真实数据优先
   合并: (1) 入库的跨届真实交锋 h2h_matches (来源 API-Football)
         (2) 本届已结束的对阵 (matches 表)
   都从"当前主队视角"聚合。无任何真实数据时 total=0,
   由调用方 (predictions) 回退到 Elo 合成值。
   =========================================================== */
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { h2hMatches, matches } from '../db/schema.js';
import type { H2H } from '../domain/types.js';

/** 规范化 pair: 返回 [小, 大] (字典序)。 */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export interface H2HMeeting {
  date: string; // YYYY-MM-DD
  competition: string;
  homeGoals: number; // 当前主队进球
  awayGoals: number; // 当前客队进球
  source: 'history' | 'tournament';
}

export interface H2HResult extends H2H {
  recent: H2HMeeting[]; // 最近在前, 最多 5 条
  real: boolean; // 是否有真实交锋数据
}

/** 当前主队 homeCode 视角的真实历史交锋 (含本届)。 */
export async function realH2H(homeCode: string, awayCode: string): Promise<H2HResult> {
  const [a, b] = canonicalPair(homeCode, awayCode);

  // 1) 入库的跨届真实交锋
  const stored = await db
    .select()
    .from(h2hMatches)
    .where(and(eq(h2hMatches.aCode, a), eq(h2hMatches.bCode, b)));

  // 2) 本届已结束的对阵
  const tournament = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.status, 'finished'),
        or(
          and(eq(matches.homeCode, homeCode), eq(matches.awayCode, awayCode)),
          and(eq(matches.homeCode, awayCode), eq(matches.awayCode, homeCode)),
        ),
      ),
    );

  const meetings: H2HMeeting[] = [];

  for (const r of stored) {
    if (r.aScore == null || r.bScore == null) continue;
    // canonical(a,b) -> 当前主队视角
    const homeIsA = homeCode === a;
    meetings.push({
      date: r.playedOn,
      competition: r.competition,
      homeGoals: homeIsA ? r.aScore : r.bScore,
      awayGoals: homeIsA ? r.bScore : r.aScore,
      source: 'history',
    });
  }
  for (const m of tournament) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const homeIsHome = m.homeCode === homeCode;
    meetings.push({
      date: (m.kickoff ?? new Date(0)).toISOString().slice(0, 10),
      competition: m.stage,
      homeGoals: homeIsHome ? m.homeScore : m.awayScore,
      awayGoals: homeIsHome ? m.awayScore : m.homeScore,
      source: 'tournament',
    });
  }

  meetings.sort((x, y) => (x.date < y.date ? 1 : -1)); // 最近在前

  let aw = 0;
  let dr = 0;
  let bw = 0;
  for (const m of meetings) {
    if (m.homeGoals > m.awayGoals) aw++;
    else if (m.homeGoals === m.awayGoals) dr++;
    else bw++;
  }

  return { total: meetings.length, aw, dr, bw, recent: meetings.slice(0, 5), real: meetings.length > 0 };
}
