/* ===========================================================
   Firo 赛前数据同步
   - 按日期拉取竞足赛程 all-list
   - 按日期拉取 TheSportsDB 足球赛程 soccer-events (未来 30 天世界杯覆盖)
   - 将能映射到本项目赛程的 HAD 胜平负赔率写入 odds 表
   说明: Firo matchId 不是 API-Football fixture id, 不写 matches.externalId。
   =========================================================== */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches, odds as oddsTable, teams } from '../db/schema.js';
import {
  firoAvailable,
  fetchLotteryAllList,
  fetchLotteryOdds,
  fetchSoccerEvents,
  type FiroMatchItem,
  type FiroOddsEntry,
  type FiroOddsRecord,
  type FiroSoccerEvent,
} from './sources/firoApi.js';

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseFiroKickoff(item: FiroMatchItem): Date | null {
  const date = item.matchMain.matchStartDate || item.matchMain.matchDate;
  const time = item.matchMain.matchTime;
  if (!date || !time) return null;
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEventKickoff(event: FiroSoccerEvent): Date | null {
  const date = event.dateEventLocalBj;
  const time = event.strTimeLocalBj;
  if (!date || !time) return null;
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
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

function findMatch(args: {
  homeName: string;
  awayName: string;
  kickoff: Date | null;
  nameToCode: Map<string, string>;
  matchRows: (typeof matches.$inferSelect)[];
}) {
  const homeCode = args.nameToCode.get(normName(args.homeName));
  const awayCode = args.nameToCode.get(normName(args.awayName));
  if (!homeCode || !awayCode) return null;

  const candidates = args.matchRows
    .map((m) => {
      const same = m.homeCode === homeCode && m.awayCode === awayCode;
      const reversed = m.homeCode === awayCode && m.awayCode === homeCode;
      if (!same && !reversed) return null;
      const gap = args.kickoff && m.kickoff ? Math.abs(m.kickoff.getTime() - args.kickoff.getTime()) : 0;
      return { match: m, reversed, gap };
    })
    .filter((x): x is { match: typeof matches.$inferSelect; reversed: boolean; gap: number } => !!x)
    .sort((a, b) => a.gap - b.gap);

  const hit = candidates[0];
  if (!hit || (args.kickoff && hit.match.kickoff && hit.gap > 48 * 60 * 60 * 1000)) return null;
  return hit;
}

export async function runFiroSync(opts: { dates?: string[]; days?: number; quiet?: boolean } = {}) {
  const log = (...a: unknown[]) => !opts.quiet && console.log(...a);
  if (!firoAvailable()) {
    log('⚠ 未配置 FIRO_API_KEY/FIRO_PRIVATE_KEY,跳过 Firo 同步。');
    return { skipped: true, dates: 0, lotteryMatches: 0, soccerEvents: 0, matched: 0, oddsRows: 0, unmatched: 0 };
  }

  const dateList = opts.dates?.length
    ? opts.dates
    : Array.from({ length: opts.days ?? 14 }, (_, i) => localDate(i));

  const teamRows = await db.select().from(teams);
  const nameToCode = new Map<string, string>();
  for (const t of teamRows) {
    nameToCode.set(normName(t.name), t.code);
    nameToCode.set(normName(t.en), t.code);
  }

  const matchRows = await db.select().from(matches);
  let firoMatches = 0;
  let soccerEvents = 0;
  let matched = 0;
  let oddsRows = 0;
  let unmatched = 0;
  const oddsFetched = new Set<number>();

  for (const date of dateList) {
    log(`▶ Firo 拉取 ${date} …`);

    const events = await fetchSoccerEvents(date);
    soccerEvents += events.matches.length;
    for (const event of events.matches) {
      const hit = findMatch({
        homeName: event.homeStrTeamZh || event.strHomeTeam,
        awayName: event.awayStrTeamZh || event.strAwayTeam,
        kickoff: parseEventKickoff(event),
        nameToCode,
        matchRows,
      });
      if (!hit) continue;
      matched++;

      if (!event.matchId || oddsFetched.has(event.matchId)) continue;
      oddsFetched.add(event.matchId);
      const history = await fetchLotteryOdds(event.matchId);
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
    }

    const items = await fetchLotteryAllList(date);
    firoMatches += items.length;
    for (const item of items) {
      const had = latestHad(item);
      if (!had) continue;
      const hit = findMatch({
        homeName: item.matchMain.homeTeamName,
        awayName: item.matchMain.awayTeamName,
        kickoff: parseFiroKickoff(item),
        nameToCode,
        matchRows,
      });
      if (!hit) {
        unmatched++;
        continue;
      }

      const inserted = await writeOdds({
        matchId: hit.match.id,
        bookmaker: `Firo HAD #${item.matchMain.matchId}`,
        homeWin: hit.reversed ? had.awayOdds : had.homeOdds,
        draw: had.drawOdds,
        awayWin: hit.reversed ? had.homeOdds : had.awayOdds,
        capturedAt: capturedAt(had),
      });
      if (inserted) oddsRows++;
      matched++;
    }
  }

  log(`✅ Firo 同步完成: ${dateList.length} 天 / 竞足 ${firoMatches} 场 / 足球赛程 ${soccerEvents} 场, 匹配 ${matched} 场, 写入赔率 ${oddsRows} 条, 未匹配 ${unmatched} 场`);
  return { dates: dateList.length, lotteryMatches: firoMatches, soccerEvents, matched, oddsRows, unmatched };
}

const isCli = process.argv[1]?.endsWith('firoSync.ts') || process.argv[1]?.endsWith('firoSync.js');
if (isCli) {
  const argv = process.argv.slice(2);
  const dates = argv
    .filter((a) => a.startsWith('--date='))
    .map((a) => a.slice('--date='.length));
  const days = Number(argv.find((a) => a.startsWith('--days='))?.slice('--days='.length) ?? '30');
  runFiroSync({ dates, days })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Firo 同步失败:', err);
      process.exit(1);
    });
}
