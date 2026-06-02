/* ===========================================================
   种子脚本 · pnpm seed
   OpenFootball (身份/赛程) + 策展元数据 (实力) + 策展阵容 -> SQLite。
   幂等: 球队/比赛 upsert, 球员按队重建。无需任何 API key。
   =========================================================== */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams, players, matches } from '../db/schema.js';
import { fetchTeams, fetchMatches } from './sources/openfootball.js';
import { buildNameToCode, mapMatch } from './mappers.js';
import { TEAM_META, DEFAULT_META } from './data/teamMeta.js';
import { PLAYERS } from './data/players.js';

async function seed() {
  console.log('▶ 拉取 OpenFootball 数据 …');
  const [ofTeams, ofMatches] = await Promise.all([fetchTeams(), fetchMatches()]);
  console.log(`  · ${ofTeams.length} 队, ${ofMatches.length} 场原始赛程`);

  /* ── Teams ── */
  let teamCount = 0;
  for (const t of ofTeams) {
    const meta = TEAM_META[t.fifa_code];
    const m = meta ?? DEFAULT_META;
    const zh = meta?.zh ?? t.name;
    await db
      .insert(teams)
      .values({
        code: t.fifa_code,
        name: zh,
        en: t.name,
        group: t.group ?? '',
        confed: t.confed ?? null,
        flagEmoji: t.flag_icon ?? null,
        accent: m.accent,
        rank: m.rank,
        fifaPoints: m.points,
        ovr: m.ovr,
        att: m.att,
        mid: m.mid,
        def: m.def,
        form: m.form,
        titles: m.titles,
        note: m.note,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: teams.code,
        set: {
          name: zh,
          en: t.name,
          group: t.group ?? '',
          confed: t.confed ?? null,
          flagEmoji: t.flag_icon ?? null,
          accent: m.accent,
          rank: m.rank,
          fifaPoints: m.points,
          ovr: m.ovr,
          att: m.att,
          mid: m.mid,
          def: m.def,
          form: m.form,
          titles: m.titles,
          note: m.note,
          updatedAt: new Date(),
        },
      });
    teamCount++;
  }
  console.log(`  · 写入 ${teamCount} 支球队`);

  /* ── Players (按队重建) ── */
  let playerCount = 0;
  for (const [code, roster] of Object.entries(PLAYERS)) {
    await db.delete(players).where(eq(players.teamCode, code));
    for (const [name, pos, num, age, club, r, ovr] of roster) {
      await db.insert(players).values({
        teamCode: code,
        name,
        pos,
        num,
        age,
        club,
        pace: r[0],
        shooting: r[1],
        passing: r[2],
        defending: r[3],
        stamina: r[4],
        ovr,
        updatedAt: new Date(),
      });
      playerCount++;
    }
  }
  console.log(`  · 写入 ${playerCount} 名球员 (${Object.keys(PLAYERS).length} 队有阵容)`);

  /* ── Matches ── */
  const nameToCode = buildNameToCode(ofTeams);
  let matchCount = 0;
  let skipped = 0;
  for (const om of ofMatches) {
    const mm = mapMatch(om, nameToCode);
    if (!mm) {
      skipped++;
      continue;
    }
    await db
      .insert(matches)
      .values({
        id: mm.id,
        homeCode: mm.homeCode,
        awayCode: mm.awayCode,
        stage: mm.stage,
        round: mm.round,
        group: mm.group ?? null,
        venue: mm.venue,
        kickoff: mm.kickoff,
        status: 'scheduled',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: matches.id,
        set: {
          stage: mm.stage,
          round: mm.round,
          group: mm.group ?? null,
          venue: mm.venue,
          kickoff: mm.kickoff,
          updatedAt: new Date(),
        },
      });
    matchCount++;
  }
  console.log(`  · 写入 ${matchCount} 场比赛 (跳过 ${skipped} 场未定对阵的淘汰赛占位)`);

  const fallbackCount = await ensureSquadDepth(11);
  if (fallbackCount > 0) {
    console.log(`  · 补齐 ${fallbackCount} 名开赛前阵容占位球员 (最终名单公布后用 FC26/真实名单覆盖)`);
  }

  console.log('✅ 种子完成');
}

function clamp(n: number): number {
  return Math.max(45, Math.min(92, Math.round(n)));
}

function fallbackAttrs(t: typeof teams.$inferSelect, pos: string): [number, number, number, number, number, number] {
  if (pos === 'GK') return [clamp(t.def - 18), 30, clamp(t.mid - 8), clamp(t.def + 2), clamp(t.ovr), clamp(t.ovr)];
  if (pos === 'DF') return [clamp(t.def - 2), clamp(t.att - 25), clamp(t.mid - 4), clamp(t.def), clamp(t.ovr + 1), clamp(t.def)];
  if (pos === 'MF') return [clamp(t.mid - 3), clamp((t.att + t.mid) / 2 - 5), clamp(t.mid), clamp((t.mid + t.def) / 2), clamp(t.ovr + 2), clamp(t.mid)];
  return [clamp(t.att), clamp(t.att + 1), clamp(t.mid - 2), clamp(t.def - 25), clamp(t.ovr + 1), clamp(t.att)];
}

async function ensureSquadDepth(minPerTeam: number): Promise<number> {
  const teamRows = await db.select().from(teams);
  const roles: [string, string, number][] = [
    ['门将', 'GK', 1],
    ['中卫', 'DF', 4],
    ['边卫', 'DF', 2],
    ['后防核心', 'DF', 5],
    ['后腰', 'MF', 6],
    ['中场核心', 'MF', 8],
    ['组织核心', 'MF', 10],
    ['边锋', 'FW', 11],
    ['中锋', 'FW', 9],
    ['前场核心', 'FW', 7],
    ['轮换尖刀', 'FW', 19],
  ];

  let inserted = 0;
  for (const t of teamRows) {
    const squad = await db.select().from(players).where(eq(players.teamCode, t.code));
    if (squad.length >= minPerTeam) continue;
    const existingNames = new Set(squad.map((p) => p.name));
    let count = squad.length;
    for (const [role, pos, num] of roles) {
      if (count >= minPerTeam) break;
      const name = `${t.name}${role}`;
      if (existingNames.has(name)) continue;
      const [pace, shooting, passing, defending, stamina, ovr] = fallbackAttrs(t, pos);
      await db
        .insert(players)
        .values({
          teamCode: t.code,
          name,
          pos,
          num,
          age: 26,
          club: '开赛前名单待公布',
          pace,
          shooting,
          passing,
          defending,
          stamina,
          ovr,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
      existingNames.add(name);
      count++;
      inserted++;
    }
  }
  return inserted;
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 种子失败:', err);
    process.exit(1);
  });
