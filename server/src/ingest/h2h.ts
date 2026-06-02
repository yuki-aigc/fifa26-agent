/* ===========================================================
   历史交锋回填 · pnpm h2h
   1) 解析每支队的 API-Football team id (WC2022 批量 + 名称搜索兜底), 存 teams.api_id
   2) 对每个已定对阵, 拉 /fixtures/headtohead 真实历史交锋写入 h2h_matches
   登记表 h2h_pairs 避免重复打接口 (区分"已查无交锋"与"未查")。
   配额友好: 免费档 100 次/天, 用 --limit=N 分批; --refresh 忽略登记重抓。
   无 API_FOOTBALL_KEY 时优雅跳过。
   =========================================================== */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams, matches, h2hMatches, h2hPairs } from '../db/schema.js';
import { config } from '../config.js';
import { fetchTeamsForSeason, searchTeam, fetchHeadToHead } from './sources/apiFootball.js';
import { canonicalPair } from '../services/h2h.js';

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, '');
}

// 已知名称差异 (我们的 en -> API-Football 搜索词)
const SEARCH_ALIAS: Record<string, string> = {
  'South Korea': 'Korea Republic',
  'IR Iran': 'Iran',
  'United States': 'USA',
  'Bosnia & Herzegovina': 'Bosnia',
  Curaçao: 'Curacao',
  'DR Congo': 'Congo DR',
};

interface Counters {
  calls: number;
}

/** 解析并持久化所有队的 api_id。返回 code->apiId。 */
async function resolveApiIds(counters: Counters): Promise<Map<string, number>> {
  const rows = await db.select().from(teams);
  const codeToId = new Map<string, number>();
  for (const t of rows) if (t.apiId) codeToId.set(t.code, t.apiId);

  const missing = rows.filter((t) => !t.apiId);
  if (missing.length === 0) {
    console.log(`  · 所有 ${rows.length} 队已有 api_id`);
    return codeToId;
  }

  // 批量: WC2022 参赛队 (1 次调用覆盖 ~32 队)
  console.log('  · 拉取 WC2022 参赛队 id …');
  const wc22 = await fetchTeamsForSeason(2022);
  counters.calls++;
  const nameToId = new Map<string, number>();
  for (const e of wc22) nameToId.set(normName(e.name), e.id);

  let resolved = 0;
  for (const t of missing) {
    let id = nameToId.get(normName(t.en));
    if (!id) {
      // 搜索兜底 (每队 1 次)
      const term = SEARCH_ALIAS[t.en] ?? t.en;
      const hit = await searchTeam(term);
      counters.calls++;
      id = hit?.id;
      if (id) console.log(`    搜索匹配 ${t.en} -> ${hit!.name} (#${id})`);
      else console.warn(`    ⚠ 未解析: ${t.code} ${t.en}`);
    }
    if (id) {
      await db.update(teams).set({ apiId: id, updatedAt: new Date() }).where(eq(teams.code, t.code));
      codeToId.set(t.code, id);
      resolved++;
    }
  }
  console.log(`  · 新解析 ${resolved}/${missing.length} 队 (调用 ${counters.calls} 次)`);
  return codeToId;
}

async function main() {
  if (!config.apiFootball.key) {
    console.log('⚠ 未配置 API_FOOTBALL_KEY,跳过 H2H 回填。');
    return;
  }
  const argv = process.argv.slice(2);
  const limit = Number(argv.find((a) => a.startsWith('--limit='))?.slice('--limit='.length) ?? '60');
  const refresh = argv.includes('--refresh');

  const counters: Counters = { calls: 0 };
  console.log('▶ 解析球队 api_id …');
  const codeToId = await resolveApiIds(counters);

  // 收集已定对阵的规范化 pair (去重)
  const matchRows = await db.select().from(matches);
  const pairs = new Map<string, [string, string]>();
  for (const m of matchRows) {
    const [a, b] = canonicalPair(m.homeCode, m.awayCode);
    pairs.set(`${a}|${b}`, [a, b]);
  }

  // 已登记的 pair (跳过, 除非 --refresh)
  const done = new Set<string>();
  if (!refresh) {
    for (const p of await db.select().from(h2hPairs)) done.add(`${p.aCode}|${p.bCode}`);
  }

  const todo = [...pairs.values()].filter(([a, b]) => !done.has(`${a}|${b}`));
  console.log(`▶ 待抓取 ${todo.length} 对 (已登记 ${done.size}, 本轮上限 ${limit})`);

  let fetched = 0;
  let stored = 0;
  for (const [a, b] of todo) {
    if (fetched >= limit) {
      console.log(`  · 达到本轮上限 ${limit},剩余 ${todo.length - fetched} 对下次再跑`);
      break;
    }
    const idA = codeToId.get(a);
    const idB = codeToId.get(b);
    if (!idA || !idB) {
      console.warn(`  ⚠ 跳过 ${a}-${b}: 缺 api_id`);
      continue;
    }
    const fixtures = await fetchHeadToHead(idA, idB);
    counters.calls++;
    fetched++;

    let meetings = 0;
    for (const fx of fixtures) {
      // fixture 的 home/away id 映射回我们的 code, 再规范化为 (a,b)
      const homeCode = fx.teams.home.id === idA ? a : b;
      const aIsHome = homeCode === a;
      await db
        .insert(h2hMatches)
        .values({
          aCode: a,
          bCode: b,
          playedOn: fx.fixture.date.slice(0, 10),
          aScore: aIsHome ? fx.goals.home! : fx.goals.away!,
          bScore: aIsHome ? fx.goals.away! : fx.goals.home!,
          competition: fx.league.name,
          externalId: String(fx.fixture.id),
        })
        .onConflictDoNothing();
      meetings++;
      stored++;
    }
    await db
      .insert(h2hPairs)
      .values({ aCode: a, bCode: b, fetchedAt: new Date(), meetings })
      .onConflictDoUpdate({ target: [h2hPairs.aCode, h2hPairs.bCode], set: { fetchedAt: new Date(), meetings } });
  }

  console.log(`✅ H2H 回填完成: 抓取 ${fetched} 对, 写入 ${stored} 场, 共调用 API ${counters.calls} 次`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ H2H 回填失败:', err);
    process.exit(1);
  });
