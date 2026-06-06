/* ===========================================================
   实时同步 · 用 API-Football 刷新比赛
   - 比分 / 状态 / 进行分钟 (elapsed)
   - 比赛统计 (控球/射门/xG) -> match_stats
   - 1X2 赔率 (时间序列) -> odds
   - 结果落库后: 重算真实 form + 给预测打分
   对齐策略: 优先 externalId, 首次用 队名+开赛日 匹配并回写 externalId。
   可作为 CLI (pnpm sync) 或被 server 内置定时器调用 (runSync)。
   无 API_FOOTBALL_KEY 时优雅跳过。
   =========================================================== */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams, matches, odds as oddsTable } from '../db/schema.js';
import { config } from '../config.js';
import { fetchFixtures, fetchStatistics, fetchOdds, fetchInjuries, mapStatus, type AfFixture, type ParsedTeamStats } from './sources/apiFootball.js';
import { upsertMatchStats } from '../services/stats.js';
import { upsertInjury } from '../services/injuries.js';
import { recomputeForm } from '../services/standings.js';
import { gradeAllFinished } from '../services/accuracy.js';
import { emitMatchEvent } from '../services/eventBus.js';

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, '');
}

export interface SyncOptions {
  mode?: 'full' | 'live' | 'date';
  date?: string; // YYYY-MM-DD (mode='date')
  stats?: boolean; // 拉比赛统计 (默认 true)
  odds?: boolean; // 拉赔率 (默认 true)
  injuries?: boolean; // 拉伤病名单 (默认 true)
  quiet?: boolean;
}

export interface SyncResult {
  skipped?: boolean;
  fixtures: number;
  matchesUpdated: number;
  statsTeams: number;
  oddsRows: number;
  injuriesRows: number;
  graded: number;
}

export async function runSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  const stats = opts.stats ?? true;
  const pullOdds = opts.odds ?? true;
  const pullInjuries = opts.injuries ?? true;

  if (!config.apiFootball.key) {
    log('⚠ 未配置 API_FOOTBALL_KEY,跳过实时同步 (种子数据已可用)。');
    return { skipped: true, fixtures: 0, matchesUpdated: 0, statsTeams: 0, oddsRows: 0, injuriesRows: 0, graded: 0 };
  }

  // 名称/externalId 索引
  const teamRows = await db.select().from(teams);
  const nameToCode = new Map<string, string>();
  for (const t of teamRows) {
    nameToCode.set(normName(t.en), t.code);
    nameToCode.set(normName(t.name), t.code);
  }
  const matchRows = await db.select().from(matches);
  const extToMatch = new Map<string, string>(); // externalId -> matchId
  for (const m of matchRows) if (m.externalId) extToMatch.set(m.externalId, m.id);

  // 1) 赛程/赛果
  log('▶ 拉取赛果 …');
  const fixtures = await fetchFixtures(
    opts.mode === 'live' ? { live: true } : opts.mode === 'date' && opts.date ? { date: opts.date } : {},
  );
  log(`  · ${fixtures.length} 场`);

  let matchesUpdated = 0;
  const touchedTeams = new Set<string>();
  const finishedOrLive: { matchId: string; fixtureId: number }[] = [];

  for (const fx of fixtures) {
    const matchId = resolveMatchId(fx, nameToCode, extToMatch);
    if (!matchId) continue;
    const status = mapStatus(fx.fixture.status.short);
    const prev = matchRows.find((r) => r.id === matchId);
    const res = await db
      .update(matches)
      .set({
        status,
        elapsed: fx.fixture.status.elapsed,
        homeScore: fx.goals.home,
        awayScore: fx.goals.away,
        externalId: String(fx.fixture.id),
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
      .run();
    if (res.changes > 0) {
      matchesUpdated++;
      if (prev) {
        touchedTeams.add(prev.homeCode);
        touchedTeams.add(prev.awayCode);
        const ts = Date.now();
        const hs = fx.goals.home ?? undefined;
        const as_ = fx.goals.away ?? undefined;
        const el = fx.fixture.status.elapsed ?? undefined;
        if (prev.status !== status) {
          emitMatchEvent({ type: 'status_change', matchId, timestamp: ts, data: { status, elapsed: el, homeScore: hs, awayScore: as_ } });
        }
        if (fx.goals.home !== prev.homeScore || fx.goals.away !== prev.awayScore) {
          emitMatchEvent({ type: 'score_update', matchId, timestamp: ts, data: { homeScore: hs, awayScore: as_, elapsed: el, status } });
          if (fx.goals.home != null && prev.homeScore != null && fx.goals.home > prev.homeScore) {
            emitMatchEvent({ type: 'goal', matchId, timestamp: ts, data: { team: prev.homeCode, homeScore: hs, awayScore: as_, elapsed: el } });
          }
          if (fx.goals.away != null && prev.awayScore != null && fx.goals.away > prev.awayScore) {
            emitMatchEvent({ type: 'goal', matchId, timestamp: ts, data: { team: prev.awayCode, homeScore: hs, awayScore: as_, elapsed: el } });
          }
        }
      }
      if (status === 'finished' || status === 'live') finishedOrLive.push({ matchId, fixtureId: fx.fixture.id });
    }
  }
  log(`  · 更新 ${matchesUpdated} 场`);

  // 2) 比赛统计 -> match_stats + 伤病名单 (finished/live)
  let statsTeams = 0;
  let injuriesRows = 0;
  if (stats) {
    for (const { matchId, fixtureId } of finishedOrLive) {
      const m = matchRows.find((r) => r.id === matchId);
      if (!m) continue;
      const parsed = await fetchStatistics(fixtureId);
      for (const ts of parsed) {
        const code = nameToCode.get(normName(ts.teamName));
        if (!code) continue;
        const isHome = code === m.homeCode;
        await upsertMatchStats({
          matchId,
          teamCode: code,
          isHome,
          goals: isHome ? m.homeScore : m.awayScore,
          possession: ts.possession,
          shots: ts.shots,
          shotsOnTarget: ts.shotsOnTarget,
          xg: ts.xg,
          corners: ts.corners,
          fouls: ts.fouls,
          yellow: ts.yellow,
          red: ts.red,
        });
        statsTeams++;
      }
      // 伤病: 已完赛/进行中场次 (补充历史缺阵记录)
      if (pullInjuries) {
        const injList = await fetchInjuries(fixtureId);
        for (const inj of injList) {
          const code = nameToCode.get(normName(inj.team.name));
          if (!code) continue;
          await upsertInjury({ matchId, teamCode: code, playerName: inj.player.name,
            reason: inj.reason, playerPos: inj.player.type ?? null });
          injuriesRows++;
        }
      }
    }
    log(`  · 写入统计 ${statsTeams} 队次`);
  }

  // 2b) 伤病: 未来 3 天待赛场次 (赛前预测最有价值)
  if (pullInjuries) {
    const now = Date.now();
    const cutoff = now + 3 * 24 * 60 * 60 * 1000;
    const upcoming = matchRows
      .filter((m) => m.externalId && m.status === 'scheduled' && m.kickoff &&
                     m.kickoff.getTime() > now && m.kickoff.getTime() < cutoff)
      .slice(0, 5); // 每次 sync 最多 5 个，控制配额
    for (const m of upcoming) {
      const injList = await fetchInjuries(m.externalId!);
      for (const inj of injList) {
        const code = nameToCode.get(normName(inj.team.name));
        if (!code) continue;
        await upsertInjury({ matchId: m.id, teamCode: code, playerName: inj.player.name,
          reason: inj.reason, playerPos: inj.player.type ?? null });
        injuriesRows++;
      }
    }
    if (injuriesRows > 0) log(`  · 写入伤病 ${injuriesRows} 条`);
  }

  // 3) 赔率 (时间序列)
  let oddsRows = 0;
  if (pullOdds) {
    // 刷新索引 (上面可能回写了 externalId)
    const refreshed = await db.select({ id: matches.id, externalId: matches.externalId }).from(matches);
    const ext2 = new Map<string, string>();
    for (const m of refreshed) if (m.externalId) ext2.set(m.externalId, m.id);
    const parsedOdds = await fetchOdds();
    const now = new Date();
    for (const o of parsedOdds) {
      const matchId = ext2.get(o.externalId);
      if (!matchId) continue;
      await db.insert(oddsTable).values({
        matchId,
        bookmaker: o.bookmaker,
        homeWin: o.homeWin,
        draw: o.draw,
        awayWin: o.awayWin,
        capturedAt: now,
      });
      oddsRows++;
    }
    log(`  · 写入赔率 ${oddsRows} 场`);
  }

  // 4) 结果落库后: 重算 form + 打分
  for (const code of touchedTeams) await recomputeForm(code);
  const graded = await gradeAllFinished();
  if (graded) log(`  · 预测打分 ${graded} 条`);

  log(`✅ 同步完成`);
  return { fixtures: fixtures.length, matchesUpdated, statsTeams, oddsRows, injuriesRows, graded };
}

/** 把一条 fixture 对齐到我们的 match id (externalId 优先, 回退 队名+日期)。 */
function resolveMatchId(
  fx: AfFixture,
  nameToCode: Map<string, string>,
  extToMatch: Map<string, string>,
): string | undefined {
  const byExt = extToMatch.get(String(fx.fixture.id));
  if (byExt) return byExt;
  const home = nameToCode.get(normName(fx.teams.home.name));
  const away = nameToCode.get(normName(fx.teams.away.name));
  if (!home || !away) return undefined;
  return `${fx.fixture.date.slice(0, 10)}-${home}-${away}`;
}

// ── CLI: pnpm sync [--live | --date=YYYY-MM-DD] [--no-stats] [--no-odds] ──
const isCli = process.argv[1]?.endsWith('sync.ts') || process.argv[1]?.endsWith('sync.js');
if (isCli) {
  const argv = process.argv.slice(2);
  const dateArg = argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
  const mode: SyncOptions['mode'] = argv.includes('--live') ? 'live' : dateArg ? 'date' : 'full';
  runSync({
    mode,
    date: dateArg,
    stats: !argv.includes('--no-stats'),
    odds: !argv.includes('--no-odds'),
    injuries: !argv.includes('--no-injuries'),
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ 同步失败:', err);
      process.exit(1);
    });
}

// keep type import used even if stats disabled
export type { ParsedTeamStats };
