/* ===========================================================
   实时同步脚本 · pnpm sync
   用 API-Football 刷新已有比赛的状态/比分 (赛事进行期间运行)。
   通过 队名匹配 + 开赛日期 来对齐到我们的 match 行。
   无 API_FOOTBALL_KEY 时优雅退出。
   =========================================================== */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams, matches } from '../db/schema.js';
import { config } from '../config.js';
import { fetchFixtures, mapStatus } from './sources/apiFootball.js';

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, '');
}

async function sync() {
  if (!config.apiFootball.key) {
    console.log('⚠ 未配置 API_FOOTBALL_KEY,跳过实时同步 (种子数据已可用)。');
    return;
  }

  // 用英文名/中文名建立 名称 -> code 映射
  const teamRows = await db.select().from(teams);
  const nameToCode = new Map<string, string>();
  for (const t of teamRows) {
    nameToCode.set(normName(t.en), t.code);
    nameToCode.set(normName(t.name), t.code);
  }

  console.log('▶ 拉取 API-Football 赛果 …');
  const fixtures = await fetchFixtures();
  console.log(`  · ${fixtures.length} 场`);

  let updated = 0;
  for (const fx of fixtures) {
    const home = nameToCode.get(normName(fx.teams.home.name));
    const away = nameToCode.get(normName(fx.teams.away.name));
    if (!home || !away) continue;
    const date = fx.fixture.date.slice(0, 10); // YYYY-MM-DD
    const id = `${date}-${home}-${away}`;
    const status = mapStatus(fx.fixture.status.short);

    const res = await db
      .update(matches)
      .set({
        status,
        homeScore: fx.goals.home,
        awayScore: fx.goals.away,
        externalId: String(fx.fixture.id),
        updatedAt: new Date(),
      })
      .where(and(eq(matches.id, id), eq(matches.homeCode, home), eq(matches.awayCode, away)))
      .run();
    if (res.changes > 0) updated++;
  }
  console.log(`✅ 同步完成,更新 ${updated} 场`);
}

sync()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 同步失败:', err);
    process.exit(1);
  });
