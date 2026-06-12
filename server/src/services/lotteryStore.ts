import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  lotteryAnalyses,
  lotteryMatches,
  lotteryOddsSnapshots,
  lotteryPicks,
} from '../db/schema.js';
import type {
  LotteryAnalysisRow,
  LotteryMatchRow,
  LotteryOddsSnapshotRow,
} from '../db/schema.js';
import type {
  FiroMatchItem,
  FiroOddsEntry,
  FiroOddsHistory,
  FiroOddsRecord,
  FiroSoccerEvent,
} from '../ingest/sources/firoApi.js';
import {
  loadFiroWorldCupContext,
  matchFiroLotteryItem,
  matchFiroSoccerEvent,
} from './firoWorldCup.js';
import type { LotteryAnalysisResult, LotteryPickSuggestion } from './lotteryAnalysis.js';

export interface LotterySyncResult {
  raw: number;
  stored: number;
  filteredOut: number;
  oddsSnapshots: number;
}

export interface LotteryStoredDetail {
  row: LotteryMatchRow;
  match: FiroMatchItem | null;
}

const POOL_LABELS: Record<string, string> = {
  HAD: '胜平负',
  HHAD: '让球胜平负',
  HAFU: '半全场',
  TTG: '总进球',
  CRS: '比分',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseDateTime(date?: unknown, time?: unknown): Date | null {
  const ds = typeof date === 'string' ? date : '';
  const ts = typeof time === 'string' ? time : '';
  if (!ds && !ts) return null;
  const input = ds && ts
    ? `${ds}T${ts.length === 5 ? `${ts}:00` : ts}+08:00`
    : (ds || ts);
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseUnknownUpdateTime(raw: unknown): Date | null {
  if (!isRecord(raw)) return null;
  const direct = raw.updateTime ?? raw.update_time ?? raw.changeTime ?? raw.time;
  const directDate = typeof direct === 'string' ? new Date(direct) : null;
  if (directDate && !Number.isNaN(directDate.getTime())) return directDate;
  return parseDateTime(raw.updateDate ?? raw.date, raw.updateTime ?? raw.time);
}

function oddsUpdateTime(raw: unknown, fallback = new Date(0)): Date {
  return parseUnknownUpdateTime(raw) ?? fallback;
}

function isFiroMatchItem(raw: unknown): raw is FiroMatchItem {
  return isRecord(raw) && isRecord(raw.matchMain) && Array.isArray(raw.matchOddsList) && Array.isArray(raw.matchPoolList);
}

function poolOptionLabel(poolCode: string, optionCode: string): string {
  if (poolCode === 'HAD') {
    if (optionCode === 'HOME') return '主胜';
    if (optionCode === 'DRAW') return '平';
    if (optionCode === 'AWAY') return '客胜';
  }
  if (poolCode === 'HHAD') {
    if (optionCode === 'HOME') return '让球主胜';
    if (optionCode === 'DRAW') return '让球平';
    if (optionCode === 'AWAY') return '让球客胜';
  }
  return `${POOL_LABELS[poolCode] ?? poolCode}:${optionCode}`;
}

export interface ParsedLotteryOddsSnapshot {
  firoMatchId: number;
  matchId: string | null;
  poolCode: string;
  optionCode: string;
  optionLabel: string;
  odds: number;
  goalLine: string;
  updateTime: Date;
  capturedAt: Date;
  source: string;
  raw: unknown;
}

function snapshotsFromThreeWay(args: {
  firoMatchId: number;
  matchId: string | null;
  poolCode: string;
  goalLine?: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  updateTime: Date;
  capturedAt: Date;
  source: string;
  raw: unknown;
}): ParsedLotteryOddsSnapshot[] {
  return [
    ['HOME', args.homeOdds],
    ['DRAW', args.drawOdds],
    ['AWAY', args.awayOdds],
  ].map(([optionCode, odds]) => ({
    firoMatchId: args.firoMatchId,
    matchId: args.matchId,
    poolCode: args.poolCode,
    optionCode: String(optionCode),
    optionLabel: poolOptionLabel(args.poolCode, String(optionCode)),
    odds: Number(odds),
    goalLine: args.goalLine ?? '',
    updateTime: args.updateTime,
    capturedAt: args.capturedAt,
    source: args.source,
    raw: args.raw,
  }));
}

export function parseMatchOddsSnapshots(item: FiroMatchItem, matchId: string | null, capturedAt = new Date()): ParsedLotteryOddsSnapshot[] {
  const out: ParsedLotteryOddsSnapshot[] = [];
  for (const odd of item.matchOddsList ?? []) {
    if (odd.homeOdds > 0 && odd.drawOdds > 0 && odd.awayOdds > 0) {
      out.push(...snapshotsFromThreeWay({
        firoMatchId: item.matchMain.matchId,
        matchId,
        poolCode: odd.poolCode,
        goalLine: odd.goalLine ?? '',
        homeOdds: odd.homeOdds,
        drawOdds: odd.drawOdds,
        awayOdds: odd.awayOdds,
        updateTime: oddsUpdateTime(odd, capturedAt),
        capturedAt,
        source: 'firo:list',
        raw: odd,
      }));
    }
  }
  return out;
}

function parseHistoryRecords(args: {
  firoMatchId: number;
  matchId: string | null;
  poolCode: string;
  records: FiroOddsRecord[] | undefined;
  capturedAt: Date;
}): ParsedLotteryOddsSnapshot[] {
  const out: ParsedLotteryOddsSnapshot[] = [];
  for (const record of args.records ?? []) {
    if (record.homeWinOdds > 0 && record.drawOdds > 0 && record.awayWinOdds > 0) {
      out.push(...snapshotsFromThreeWay({
        firoMatchId: args.firoMatchId,
        matchId: args.matchId,
        poolCode: args.poolCode,
        goalLine: record.goalLine ?? '',
        homeOdds: record.homeWinOdds,
        drawOdds: record.drawOdds,
        awayOdds: record.awayWinOdds,
        updateTime: parseDateTime(record.updateDate, record.updateTime) ?? args.capturedAt,
        capturedAt: args.capturedAt,
        source: 'firo:history',
        raw: record,
      }));
    }
  }
  return out;
}

function parseGenericPoolRecords(args: {
  firoMatchId: number;
  matchId: string | null;
  poolCode: string;
  records: unknown[] | undefined;
  capturedAt: Date;
}): ParsedLotteryOddsSnapshot[] {
  const out: ParsedLotteryOddsSnapshot[] = [];
  for (const [index, raw] of (args.records ?? []).entries()) {
    if (!isRecord(raw)) {
      out.push({
        firoMatchId: args.firoMatchId,
        matchId: args.matchId,
        poolCode: args.poolCode,
        optionCode: `RAW_${index}`,
        optionLabel: `${POOL_LABELS[args.poolCode] ?? args.poolCode}未解析`,
        odds: 0,
        goalLine: '',
        updateTime: new Date(0),
        capturedAt: args.capturedAt,
        source: 'firo:raw',
        raw,
      });
      continue;
    }

    const updateTime = oddsUpdateTime(raw, new Date(0));
    const goalLine = String(raw.goalLine ?? raw.line ?? '');
    const oddsEntries = Object.entries(raw)
      .filter(([key, value]) => /odds|sp/i.test(key) && !/flag/i.test(key) && (toNumber(value) ?? 0) > 0);

    if (oddsEntries.length === 0) {
      out.push({
        firoMatchId: args.firoMatchId,
        matchId: args.matchId,
        poolCode: args.poolCode,
        optionCode: String(raw.optionCode ?? raw.result ?? raw.score ?? `RAW_${index}`),
        optionLabel: String(raw.optionLabel ?? raw.name ?? raw.score ?? `${POOL_LABELS[args.poolCode] ?? args.poolCode}未解析`),
        odds: 0,
        goalLine,
        updateTime,
        capturedAt: args.capturedAt,
        source: 'firo:raw',
        raw,
      });
      continue;
    }

    for (const [key, value] of oddsEntries) {
      const odds = toNumber(value);
      if (odds == null) continue;
      const optionCode = key.replace(/Odds|odds|SP|sp/g, '').replace(/[^a-zA-Z0-9:_+-]/g, '') || key;
      out.push({
        firoMatchId: args.firoMatchId,
        matchId: args.matchId,
        poolCode: args.poolCode,
        optionCode,
        optionLabel: String(raw.optionLabel ?? raw.name ?? raw.score ?? `${POOL_LABELS[args.poolCode] ?? args.poolCode}:${optionCode}`),
        odds,
        goalLine,
        updateTime,
        capturedAt: args.capturedAt,
        source: 'firo:history',
        raw,
      });
    }
  }
  return out;
}

export function parseOddsHistorySnapshots(
  firoMatchId: number,
  matchId: string | null,
  history: FiroOddsHistory,
  capturedAt = new Date(),
): ParsedLotteryOddsSnapshot[] {
  return [
    ...parseHistoryRecords({ firoMatchId, matchId, poolCode: 'HAD', records: history.hadOddsList, capturedAt }),
    ...parseHistoryRecords({ firoMatchId, matchId, poolCode: 'HHAD', records: history.hhadOddsList, capturedAt }),
    ...parseGenericPoolRecords({ firoMatchId, matchId, poolCode: 'HAFU', records: history.hafuOddsList, capturedAt }),
    ...parseGenericPoolRecords({ firoMatchId, matchId, poolCode: 'TTG', records: history.ttgOddsList, capturedAt }),
    ...parseGenericPoolRecords({ firoMatchId, matchId, poolCode: 'CRS', records: history.crsOddsList, capturedAt }),
  ];
}

async function insertSnapshots(snapshots: ParsedLotteryOddsSnapshot[]): Promise<number> {
  let inserted = 0;
  for (const snapshot of snapshots) {
    const res = await db
      .insert(lotteryOddsSnapshots)
      .values(snapshot)
      .onConflictDoNothing();
    if ((res as { changes?: number }).changes !== 0) inserted++;
  }
  return inserted;
}

export async function upsertLotteryMatch(item: FiroMatchItem, matchId: string | null): Promise<number> {
  const mm = item.matchMain;
  await db
    .insert(lotteryMatches)
    .values({
      firoMatchId: mm.matchId,
      matchId,
      matchNumStr: mm.matchNumStr ?? '',
      matchDate: mm.matchDate ?? '',
      matchStartDate: mm.matchStartDate ?? '',
      matchTime: mm.matchTime ?? '',
      leagueName: mm.leagueName ?? '',
      leagueShort: mm.leagueShort ?? '',
      homeTeamName: mm.homeTeamName ?? '',
      awayTeamName: mm.awayTeamName ?? '',
      matchStatus: mm.matchStatus ?? '',
      sellStatus: mm.sellStatus ?? '',
      poolStatus: item.matchPoolList ?? [],
      raw: item,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: lotteryMatches.firoMatchId,
      set: {
        matchId,
        matchNumStr: mm.matchNumStr ?? '',
        matchDate: mm.matchDate ?? '',
        matchStartDate: mm.matchStartDate ?? '',
        matchTime: mm.matchTime ?? '',
        leagueName: mm.leagueName ?? '',
        leagueShort: mm.leagueShort ?? '',
        homeTeamName: mm.homeTeamName ?? '',
        awayTeamName: mm.awayTeamName ?? '',
        matchStatus: mm.matchStatus ?? '',
        sellStatus: mm.sellStatus ?? '',
        poolStatus: item.matchPoolList ?? [],
        raw: item,
        updatedAt: new Date(),
      },
    });
  return insertSnapshots(parseMatchOddsSnapshots(item, matchId));
}

export async function upsertLotteryEvent(event: FiroSoccerEvent, matchId: string | null): Promise<void> {
  if (!event.matchId) return;
  await db
    .insert(lotteryMatches)
    .values({
      firoMatchId: event.matchId,
      matchId,
      matchNumStr: '',
      matchDate: event.dateEventLocalBj ?? '',
      matchStartDate: event.dateEventLocalBj ?? '',
      matchTime: event.strTimeLocalBj ?? '',
      leagueName: event.finishLeagueZh || event.strLeague || '',
      leagueShort: event.shortLeagueZh || event.strLeague || '',
      homeTeamName: event.homeStrTeamZh || event.strHomeTeam || '',
      awayTeamName: event.awayStrTeamZh || event.strAwayTeam || '',
      matchStatus: event.strStatus ?? '',
      sellStatus: event.isJc ? 'Selling' : '',
      poolStatus: [],
      raw: event,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: lotteryMatches.firoMatchId,
      set: {
        matchId,
        matchDate: event.dateEventLocalBj ?? '',
        matchStartDate: event.dateEventLocalBj ?? '',
        matchTime: event.strTimeLocalBj ?? '',
        leagueName: event.finishLeagueZh || event.strLeague || '',
        leagueShort: event.shortLeagueZh || event.strLeague || '',
        homeTeamName: event.homeStrTeamZh || event.strHomeTeam || '',
        awayTeamName: event.awayStrTeamZh || event.strAwayTeam || '',
        matchStatus: event.strStatus ?? '',
        sellStatus: event.isJc ? 'Selling' : '',
        raw: event,
        updatedAt: new Date(),
      },
    });
}

export async function upsertLotteryOddsHistory(firoMatchId: number, matchId: string | null, history: FiroOddsHistory): Promise<number> {
  return insertSnapshots(parseOddsHistorySnapshots(firoMatchId, matchId, history));
}

export async function upsertWorldCupLotteryItems(items: FiroMatchItem[]): Promise<{ matches: FiroMatchItem[]; result: LotterySyncResult }> {
  const context = await loadFiroWorldCupContext();
  const matches: FiroMatchItem[] = [];
  let oddsSnapshots = 0;
  let filteredOut = 0;
  for (const item of items) {
    const hit = matchFiroLotteryItem(item, context);
    if (!hit) {
      filteredOut++;
      continue;
    }
    matches.push(item);
    oddsSnapshots += await upsertLotteryMatch(item, hit.match.id);
  }
  return { matches, result: { raw: items.length, stored: matches.length, filteredOut, oddsSnapshots } };
}

export async function listStoredLotteryMatches(date?: string): Promise<FiroMatchItem[]> {
  const where = date ? eq(lotteryMatches.matchStartDate, date) : undefined;
  const rows = await db
    .select()
    .from(lotteryMatches)
    .where(where)
    .orderBy(lotteryMatches.matchStartDate, lotteryMatches.matchTime);
  return rows.map((row) => row.raw).filter(isFiroMatchItem);
}

export async function getStoredLotteryMatch(firoMatchId: number): Promise<LotteryStoredDetail | null> {
  const row = (await db.select().from(lotteryMatches).where(eq(lotteryMatches.firoMatchId, firoMatchId)).limit(1))[0];
  if (!row) return null;
  return { row, match: isFiroMatchItem(row.raw) ? row.raw : null };
}

function snapshotToRecord(group: LotteryOddsSnapshotRow[]): FiroOddsRecord | null {
  const byOption = new Map(group.map((r) => [r.optionCode, r]));
  const home = byOption.get('HOME');
  const draw = byOption.get('DRAW');
  const away = byOption.get('AWAY');
  if (!home || !draw || !away) return null;
  const d = home.updateTime;
  return {
    homeWinOdds: home.odds,
    homeWinFlag: 0,
    drawOdds: draw.odds,
    drawFlag: 0,
    awayWinOdds: away.odds,
    awayWinFlag: 0,
    goalLine: home.goalLine || undefined,
    updateDate: d.toISOString().slice(0, 10),
    updateTime: d.toISOString(),
  };
}

export async function buildStoredOddsHistory(firoMatchId: number): Promise<FiroOddsHistory> {
  const rows = await db
    .select()
    .from(lotteryOddsSnapshots)
    .where(eq(lotteryOddsSnapshots.firoMatchId, firoMatchId))
    .orderBy(lotteryOddsSnapshots.updateTime);
  const groups = new Map<string, LotteryOddsSnapshotRow[]>();
  for (const row of rows.filter((r) => r.poolCode === 'HAD' || r.poolCode === 'HHAD')) {
    const key = `${row.poolCode}|${row.goalLine}|${row.updateTime.getTime()}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const hadOddsList: FiroOddsRecord[] = [];
  const hhadOddsList: FiroOddsRecord[] = [];
  for (const [key, group] of groups) {
    const record = snapshotToRecord(group);
    if (!record) continue;
    if (key.startsWith('HAD|')) hadOddsList.push(record);
    if (key.startsWith('HHAD|')) hhadOddsList.push(record);
  }
  return {
    matchId: String(firoMatchId),
    hadOddsList,
    hhadOddsList,
    hafuOddsList: rows.filter((r) => r.poolCode === 'HAFU').map((r) => r.raw),
    ttgOddsList: rows.filter((r) => r.poolCode === 'TTG').map((r) => r.raw),
    crsOddsList: rows.filter((r) => r.poolCode === 'CRS').map((r) => r.raw),
  };
}

function normalizePick(pick: LotteryPickSuggestion, fallbackIndex: number) {
  return {
    tier: pick.tier || 'unknown',
    poolCode: pick.poolCode || '',
    optionCode: pick.optionCode || pick.optionLabel || `PICK_${fallbackIndex}`,
    optionLabel: pick.optionLabel || pick.optionCode || '',
    odds: pick.odds ?? null,
    modelProbability: pick.modelProbability ?? null,
    ev: pick.ev ?? null,
    stakeFraction: pick.stakeFraction ?? null,
    reason: pick.reason || '',
    raw: pick,
  };
}

export async function persistLotteryAnalysis(args: {
  result: LotteryAnalysisResult;
  firoMatchId: number;
  matchId: string | null;
  raw?: unknown;
}): Promise<LotteryAnalysisRow> {
  const inserted = await db
    .insert(lotteryAnalyses)
    .values({
      firoMatchId: args.firoMatchId,
      matchId: args.matchId,
      provider: args.result.provider,
      model: args.result.model,
      recommendation: args.result.recommendation,
      confidence: args.result.confidence,
      reasoning: args.result.reasoning,
      raw: args.raw ?? args.result,
      createdAt: new Date(),
    })
    .returning();
  const analysis = inserted[0];
  const picks = args.result.picks ?? [];
  for (const [index, pick] of picks.entries()) {
    await db.insert(lotteryPicks).values({
      analysisId: analysis.id,
      firoMatchId: args.firoMatchId,
      matchId: args.matchId,
      ...normalizePick(pick, index),
    });
  }
  return analysis;
}

export async function latestLotteryAnalysis(firoMatchId: number): Promise<LotteryAnalysisRow | null> {
  const rows = await db
    .select()
    .from(lotteryAnalyses)
    .where(eq(lotteryAnalyses.firoMatchId, firoMatchId))
    .orderBy(desc(lotteryAnalyses.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
