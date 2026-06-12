/* ===========================================================
   Firo 赛前数据同步
   - 按日期拉取竞足赛程 all-list, 仅保留能映射到本地世界杯赛程的场次
   - 按日期拉取 TheSportsDB 足球赛程 soccer-events, 仅保留能映射到本地世界杯赛程的场次
   - 将能映射到本项目赛程的 HAD 胜平负赔率写入 odds 表
   说明: Firo matchId 不是 API-Football fixture id, 不写 matches.externalId。
   =========================================================== */
import { and, eq, like } from 'drizzle-orm';
import { db } from '../db/client.js';
import { odds as oddsTable } from '../db/schema.js';
import {
  loadFiroWorldCupContext,
  matchFiroLotteryItem,
  matchFiroSoccerEvent,
} from '../services/firoWorldCup.js';
import {
  upsertLotteryEvent,
  upsertLotteryMatch,
  upsertLotteryOddsHistory,
} from '../services/lotteryStore.js';
import {
  firoAvailable,
  fetchLotteryAllList,
  fetchLotteryOdds,
  fetchSoccerEvents,
  type FiroMatchItem,
  type FiroOddsEntry,
  type FiroOddsRecord,
} from './sources/firoApi.js';

function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function latestHad(item: FiroMatchItem): FiroOddsEntry | undefined {
  return item.matchOddsList.find((o) => o.poolCode === 'HAD' && o.homeOdds > 0 && o.drawOdds > 0 && o.awayOdds > 0);
}

function latestHadRecord(records: FiroOddsRecord[] = []): FiroOddsRecord | undefined {
  return records.find((o) => o.homeWinOdds > 0 && o.drawOdds > 0 && o.awayWinOdds > 0);
}

function capturedAt(odd: FiroOddsEntry): Date {
  const d = new Date(odd.updateTime);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function capturedAtRecord(odd: FiroOddsRecord): Date {
  const d = new Date(`${odd.updateDate}T${odd.updateTime.length === 5 ? `${odd.updateTime}:00` : odd.updateTime}+08:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function writeOdds(row: {
  matchId: string;
  bookmaker: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  capturedAt: Date;
}): Promise<boolean> {
  const exists = await db
    .select({ id: oddsTable.id })
    .from(oddsTable)
    .where(and(eq(oddsTable.matchId, row.matchId), eq(oddsTable.bookmaker, row.bookmaker), eq(oddsTable.capturedAt, row.capturedAt)))
    .limit(1);
  if (exists.length > 0) return false;
  await db.insert(oddsTable).values(row);
  return true;
}

async function deleteFiroHadOdds(): Promise<number> {
  const rows = await db
    .select({ id: oddsTable.id })
    .from(oddsTable)
    .where(like(oddsTable.bookmaker, 'Firo HAD #%'));
  if (rows.length === 0) return 0;
  await db.delete(oddsTable).where(like(oddsTable.bookmaker, 'Firo HAD #%'));
  return rows.length;
}

export async function runFiroSync(opts: {
  dates?: string[];
  days?: number;
  quiet?: boolean;
  resetFiroOdds?: boolean;
  refreshDetails?: boolean;
} = {}) {
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  if (!firoAvailable()) {
    log('⚠ 未配置 FIRO_API_KEY/FIRO_PRIVATE_KEY,跳过 Firo 同步。');
    return { skipped: true, dates: 0, lotteryMatches: 0, soccerEvents: 0, matched: 0, oddsRows: 0, oddsSnapshots: 0, unmatched: 0, filteredOut: 0, failedDates: [] };
  }

  const dateList = opts.dates?.length
    ? opts.dates
    : Array.from({ length: opts.days ?? 14 }, (_, i) => localDate(i));

  if (opts.resetFiroOdds) {
    const deleted = await deleteFiroHadOdds();
    log(`🧹 已清理旧 Firo HAD 赔率 ${deleted} 条。`);
  }

  const context = await loadFiroWorldCupContext();
  let rawLotteryMatches = 0;
  let rawSoccerEvents = 0;
  let lotteryMatches = 0;
  let soccerEvents = 0;
  let matched = 0;
  let oddsRows = 0;
  let oddsSnapshots = 0;
  let filteredOut = 0;
  const failedDates: string[] = [];
  const oddsFetched = new Set<number>();

  for (const date of dateList) {
    log(`▶ Firo 拉取 ${date} …`);

    try {
      const events = await fetchSoccerEvents(date);
      rawSoccerEvents += events.matches.length;
      for (const event of events.matches) {
        const hit = matchFiroSoccerEvent(event, context);
        if (!hit) {
          filteredOut++;
          continue;
        }
        soccerEvents++;
        matched++;

        if (!event.matchId) continue;
        await upsertLotteryEvent(event, hit.match.id);
        if (oddsFetched.has(event.matchId)) continue;
        oddsFetched.add(event.matchId);
        try {
          const history = await fetchLotteryOdds(event.matchId);
          oddsSnapshots += await upsertLotteryOddsHistory(event.matchId, hit.match.id, history);
          const had = latestHadRecord(history.hadOddsList);
          if (!had) continue;
          const inserted = await writeOdds({
            matchId: hit.match.id,
            bookmaker: `Firo HAD #${event.matchId}`,
            homeWin: hit.reversed ? had.awayWinOdds : had.homeWinOdds,
            draw: had.drawOdds,
            awayWin: hit.reversed ? had.homeWinOdds : had.awayWinOdds,
            capturedAt: capturedAtRecord(had),
          });
          if (inserted) oddsRows++;
        } catch (err) {
          log(`  ⚠ ${date} matchId=${event.matchId} 赔率历史拉取失败: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      failedDates.push(`${date}:soccer-events`);
      log(`  ⚠ ${date} soccer-events 拉取失败: ${(err as Error).message}`);
    }

    try {
      const items = await fetchLotteryAllList(date);
      rawLotteryMatches += items.length;
      for (const item of items) {
        const hit = matchFiroLotteryItem(item, context);
        if (!hit) {
          filteredOut++;
          continue;
        }
        lotteryMatches++;
        matched++;
        oddsSnapshots += await upsertLotteryMatch(item, hit.match.id);

        const had = latestHad(item);
        if (had) {
          const inserted = await writeOdds({
            matchId: hit.match.id,
            bookmaker: `Firo HAD #${item.matchMain.matchId}`,
            homeWin: hit.reversed ? had.awayOdds : had.homeOdds,
            draw: had.drawOdds,
            awayWin: hit.reversed ? had.homeOdds : had.awayOdds,
            capturedAt: capturedAt(had),
          });
          if (inserted) oddsRows++;
        }

        if (opts.refreshDetails && !oddsFetched.has(item.matchMain.matchId)) {
          oddsFetched.add(item.matchMain.matchId);
          try {
            const history = await fetchLotteryOdds(item.matchMain.matchId);
            oddsSnapshots += await upsertLotteryOddsHistory(item.matchMain.matchId, hit.match.id, history);
          } catch (err) {
            log(`  ⚠ ${date} matchId=${item.matchMain.matchId} 赔率历史拉取失败: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      failedDates.push(`${date}:all-list`);
      log(`  ⚠ ${date} all-list 拉取失败: ${(err as Error).message}`);
    }
  }

  log(`✅ Firo 同步完成: ${dateList.length} 天 / 原始竞足 ${rawLotteryMatches} 场 / 原始足球赛程 ${rawSoccerEvents} 场`);
  log(`   世界杯过滤后: 竞足 ${lotteryMatches} 场 / 足球赛程 ${soccerEvents} 场, 匹配 ${matched} 场, 写入 legacy 赔率 ${oddsRows} 条, 写入快照 ${oddsSnapshots} 条, 过滤非世界杯 ${filteredOut} 场`);
  if (failedDates.length) log(`   ⚠ 失败请求: ${failedDates.join(', ')}`);
  return { dates: dateList.length, lotteryMatches, soccerEvents, matched, oddsRows, oddsSnapshots, unmatched: 0, filteredOut, failedDates };
}

const isCli = process.argv[1]?.endsWith('firoSync.ts') || process.argv[1]?.endsWith('firoSync.js');
if (isCli) {
  const argv = process.argv.slice(2);
  const dates = argv
    .filter((a) => a.startsWith('--date='))
    .map((a) => a.slice('--date='.length));
  const days = Number(argv.find((a) => a.startsWith('--days='))?.slice('--days='.length) ?? '30');
  const resetFiroOdds = argv.includes('--reset-firo-odds');
  const refreshDetails = argv.includes('--refresh-details');
  runFiroSync({ dates, days, resetFiroOdds, refreshDetails })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Firo 同步失败:', err);
      process.exit(1);
    });
}
