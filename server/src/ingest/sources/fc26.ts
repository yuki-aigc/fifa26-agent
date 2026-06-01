/* ===========================================================
   数据源 (可选) · EA Sports FC 26 球员属性 CSV
   用法: tsx src/ingest/sources/fc26.ts <csv路径> [每队人数=23]
   数据获取: Kaggle "FC 26 / FIFA 26 player data" (需 Kaggle 账号下载),
   放到 server/data/cache/fc26.csv 即可。
   将 pace/shooting/passing/defending/physic 映射到我们的五维面板,
   按国家队归类、取每队 overall 最高的前 N 人写入 players 表。
   列名大小写/下划线不敏感,缺列会用合理默认值。
   =========================================================== */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { teams, players } from '../../db/schema.js';
import { mapFc26ToRadar, type Fc26Attrs } from '../mappers.js';

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const found = Object.keys(row).find((c) => c.toLowerCase().replace(/[\s_]/g, '') === k);
    if (found && row[found] !== '') return row[found];
  }
  return undefined;
}

export async function importFc26(csvPath: string, perTeam = 23): Promise<void> {
  const text = readFileSync(csvPath, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  console.log(`▶ 读取 ${rows.length} 行 FC26 数据`);

  // 国家名(英/中) -> code
  const teamRows = await db.select().from(teams);
  const nat = new Map<string, string>();
  for (const t of teamRows) {
    nat.set(t.en.toLowerCase(), t.code);
    nat.set(t.name.toLowerCase(), t.code);
  }

  // 按队收集
  const byTeam = new Map<string, { name: string; pos: string; club: string; age: number; radar: ReturnType<typeof mapFc26ToRadar> }[]>();
  for (const row of rows) {
    const nation = pick(row, ['nationality', 'nation', 'country', 'nationalteam'])?.toLowerCase();
    if (!nation) continue;
    const code = nat.get(nation);
    if (!code) continue; // 非参赛国
    const attrs: Fc26Attrs = {
      pace: num(pick(row, ['pace', 'paceacceleration'])),
      shooting: num(pick(row, ['shooting', 'finishing'])),
      passing: num(pick(row, ['passing', 'shortpassing'])),
      defending: num(pick(row, ['defending', 'defence', 'defense'])),
      physic: num(pick(row, ['physic', 'physicality', 'physical', 'stamina'])),
      overall: num(pick(row, ['overall', 'overallrating', 'rating'])),
      position: pick(row, ['position', 'bestposition', 'positions']),
      gkDiving: num(pick(row, ['gkdiving', 'goalkeepingdiving'])),
      gkHandling: num(pick(row, ['gkhandling', 'goalkeepinghandling'])),
      gkKicking: num(pick(row, ['gkkicking', 'goalkeepingkicking'])),
      gkReflexes: num(pick(row, ['gkreflexes', 'goalkeepingreflexes'])),
      gkPositioning: num(pick(row, ['gkpositioning', 'goalkeepingpositioning'])),
    };
    const radar = mapFc26ToRadar(attrs);
    const list = byTeam.get(code) ?? [];
    list.push({
      name: pick(row, ['name', 'shortname', 'longname', 'fullname']) ?? '未知',
      pos: shortPos(attrs.position),
      club: pick(row, ['club', 'clubname', 'team']) ?? '',
      age: num(pick(row, ['age'])) ?? 0,
      radar,
    });
    byTeam.set(code, list);
  }

  let total = 0;
  for (const [code, list] of byTeam) {
    const top = list.sort((a, b) => b.radar.ovr - a.radar.ovr).slice(0, perTeam);
    await db.delete(players).where(eq(players.teamCode, code));
    let num = 1;
    for (const p of top) {
      await db.insert(players).values({
        teamCode: code,
        name: p.name,
        pos: p.pos,
        num: num++,
        age: p.age,
        club: p.club,
        pace: p.radar.pace,
        shooting: p.radar.shooting,
        passing: p.radar.passing,
        defending: p.radar.defending,
        stamina: p.radar.stamina,
        ovr: p.radar.ovr,
        updatedAt: new Date(),
      });
      total++;
    }
  }
  console.log(`✅ FC26 导入完成: ${byTeam.size} 队 / ${total} 名球员`);
}

function shortPos(pos?: string): string {
  const p = (pos ?? '').toUpperCase();
  if (p.includes('GK')) return 'GK';
  if (/(CB|LB|RB|WB|DEF)/.test(p)) return 'DF';
  if (/(CM|CDM|CAM|MID|LM|RM)/.test(p)) return 'MF';
  if (/(ST|CF|LW|RW|FW|FWD)/.test(p)) return 'FW';
  return 'MF';
}

// CLI
const csv = process.argv[2];
if (csv) {
  const perTeam = process.argv[3] ? Number(process.argv[3]) : 23;
  importFc26(csv, perTeam)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ FC26 导入失败:', err);
      process.exit(1);
    });
}
