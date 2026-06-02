/* ===========================================================
   赛事内战绩 · 从 finished 比赛实时派生 (无需额外存储)
   - 球队战绩 (积分/净胜球/近期 form)
   - 小组积分榜
   - 真实历史交锋 (基于已结束场次)
   比赛结束后由 sync 调 recomputeForm 把真实 form 写回 teams 表,
   替换静态策展的 form,供 Elo + AI 使用。
   =========================================================== */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches, teams } from '../db/schema.js';
import type { MatchRow } from '../db/schema.js';

export interface TeamRecord {
  code: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number; // 进球
  ga: number; // 失球
  gd: number; // 净胜球
  points: number;
  form: string[]; // 最近在前: 'W' | 'D' | 'L'
}

/** 加载所有已结束且有比分的比赛 (按开赛升序)。 */
async function finishedMatches(): Promise<MatchRow[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.status, 'finished'), isNotNull(matches.homeScore), isNotNull(matches.awayScore)));
  return rows.sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));
}

function emptyRecord(code: string): TeamRecord {
  return { code, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
}

/** 把一场比赛累加进某队战绩 (该队视角)。 */
function applyResult(rec: TeamRecord, gfor: number, gagainst: number): void {
  rec.played++;
  rec.gf += gfor;
  rec.ga += gagainst;
  rec.gd = rec.gf - rec.ga;
  if (gfor > gagainst) {
    rec.win++;
    rec.points += 3;
    rec.form.unshift('W');
  } else if (gfor === gagainst) {
    rec.draw++;
    rec.points += 1;
    rec.form.unshift('D');
  } else {
    rec.loss++;
    rec.form.unshift('L');
  }
}

/** 单队赛事内战绩 (从已结束比赛派生)。 */
export async function teamRecord(code: string): Promise<TeamRecord> {
  const rec = emptyRecord(code);
  const all = await finishedMatches();
  for (const m of all) {
    if (m.homeCode === code) applyResult(rec, m.homeScore!, m.awayScore!);
    else if (m.awayCode === code) applyResult(rec, m.awayScore!, m.homeScore!);
  }
  rec.form = rec.form.slice(0, 5);
  return rec;
}

/** 小组积分榜 (按 积分 → 净胜球 → 进球 排序)。 */
export async function groupStandings(group: string): Promise<TeamRecord[]> {
  const groupTeams = await db.select({ code: teams.code }).from(teams).where(eq(teams.group, group));
  const recs = await Promise.all(groupTeams.map((t) => teamRecord(t.code)));
  return recs.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}

/** 把真实近期 form 写回 teams 表 (sync 在结果落库后调用)。 */
export async function recomputeForm(code: string): Promise<void> {
  const rec = await teamRecord(code);
  if (rec.played === 0) return; // 还没打过, 保留策展 form
  await db.update(teams).set({ form: rec.form, updatedAt: new Date() }).where(eq(teams.code, code));
}
