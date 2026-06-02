/* ===========================================================
   伤病 / 停赛名单 · 读写
   来源: API-Football /injuries (sync 写入)。
   作为 AI 分析的重要因素: 赛前关键球员缺阵信息。
   =========================================================== */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { injuries } from '../db/schema.js';
import type { InjuryRow } from '../db/schema.js';

export type InjuryInput = Omit<InjuryRow, 'id' | 'updatedAt'>;

/** 按 (matchId, teamCode, playerName) upsert 一条伤病/停赛记录。 */
export async function upsertInjury(row: InjuryInput): Promise<void> {
  const { matchId, teamCode, playerName, ...rest } = row;
  await db
    .insert(injuries)
    .values({ matchId, teamCode, playerName, ...rest, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [injuries.matchId, injuries.teamCode, injuries.playerName],
      set: { ...rest, updatedAt: new Date() },
    });
}

/** 某场某队的全部伤病/停赛球员（无数据返回 []）。 */
export async function getMatchInjuries(matchId: string, teamCode: string): Promise<InjuryRow[]> {
  return db
    .select()
    .from(injuries)
    .where(and(eq(injuries.matchId, matchId), eq(injuries.teamCode, teamCode)));
}
