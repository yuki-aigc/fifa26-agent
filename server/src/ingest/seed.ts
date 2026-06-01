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

  console.log('✅ 种子完成');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 种子失败:', err);
    process.exit(1);
  });
