/* ===========================================================
   数据源 · API-Football (api-sports.io)
   实时比分/状态 + 比赛统计 (控球/射门/xG) + 1X2 赔率。
   免费档 100 次/天。需要 API_FOOTBALL_KEY (见 .env)。
   种子流程完全不依赖此源。
   =========================================================== */
import { config } from '../../config.js';

const BASE = 'https://v3.football.api-sports.io';

export interface AfFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

/** API-Football 状态码 -> 我们的状态。 */
export function mapStatus(short: string): 'scheduled' | 'live' | 'finished' {
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  if (['FT', 'AET', 'PEN', 'WO'].includes(short)) return 'finished';
  return 'scheduled';
}

// 免费档限速 10 次/分钟 → 全局最小间隔 + 429 退避重试。
const MIN_INTERVAL_MS = 6500;
let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function afGet<T>(path: string): Promise<T[]> {
  if (!config.apiFootball.key) throw new Error('API_FOOTBALL_KEY 未配置');

  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const res = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': config.apiFootball.key } });
    if (res.status === 429) {
      const backoff = MIN_INTERVAL_MS * (attempt + 2); // 13s, 19.5s, 26s …
      console.warn(`  · 429 限速,${Math.round(backoff / 1000)}s 后重试 (${attempt + 1}/4)`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) throw new Error(`API-Football 请求失败 (${res.status})`);
    const json = (await res.json()) as { response?: T[]; errors?: unknown };
    if (!json.response) throw new Error(`API-Football 返回异常: ${JSON.stringify(json.errors ?? json)}`);
    return json.response;
  }
  throw new Error('API-Football 请求失败: 429 限速重试耗尽');
}

/**
 * 拉取赛程/赛果。
 * - 无参: 整季全部 (用于 seed 对齐 externalId / 全量刷新)
 * - { live:true }: 仅进行中 (赛事日高频轮询, 省额度)
 * - { date:'YYYY-MM-DD' }: 仅当天
 */
export async function fetchFixtures(opts: { live?: boolean; date?: string } = {}): Promise<AfFixture[]> {
  const q = `league=${config.apiFootball.leagueId}&season=${config.apiFootball.season}`;
  if (opts.live) return afGet<AfFixture>(`/fixtures?${q}&live=all`);
  if (opts.date) return afGet<AfFixture>(`/fixtures?${q}&date=${opts.date}`);
  return afGet<AfFixture>(`/fixtures?${q}`);
}

/* ── 比赛统计 ──────────────────────────────────────────── */
interface AfStatTeam {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

export interface ParsedTeamStats {
  teamName: string;
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  xg: number | null;
  corners: number | null;
  fouls: number | null;
  yellow: number | null;
  red: number | null;
}

function numOrNull(v: number | string | null): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const cleaned = v.replace('%', '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pick(stats: AfStatTeam['statistics'], type: string): number | null {
  const row = stats.find((s) => s.type === type);
  return row ? numOrNull(row.value) : null;
}

/** 拉取单场双方统计 (控球/射门/xG…)。无数据返回 []。 */
export async function fetchStatistics(fixtureId: string | number): Promise<ParsedTeamStats[]> {
  const res = await afGet<AfStatTeam>(`/fixtures/statistics?fixture=${fixtureId}`);
  return res.map((t) => ({
    teamName: t.team.name,
    possession: pick(t.statistics, 'Ball Possession'),
    shots: pick(t.statistics, 'Total Shots'),
    shotsOnTarget: pick(t.statistics, 'Shots on Goal'),
    xg: pick(t.statistics, 'expected_goals'),
    corners: pick(t.statistics, 'Corner Kicks'),
    fouls: pick(t.statistics, 'Fouls'),
    yellow: pick(t.statistics, 'Yellow Cards'),
    red: pick(t.statistics, 'Red Cards'),
  }));
}

/* ── 球队 ID 解析 (用于 H2H / 实时对齐) ─────────────────── */
interface AfTeamEntry {
  team: { id: number; name: string; country?: string; national?: boolean };
}

/** 某届赛事的参赛队 (league+season), 返回 名称->id。 */
export async function fetchTeamsForSeason(season: number | string): Promise<{ id: number; name: string }[]> {
  const res = await afGet<AfTeamEntry>(`/teams?league=${config.apiFootball.leagueId}&season=${season}`);
  return res.map((e) => ({ id: e.team.id, name: e.team.name }));
}

// 青年队 / 女足 / 预备队 等非成年国家队标记
const NON_SENIOR = /\b(U-?\d{2}|W|Women|Ladies|Youth|Olympic|Reserves?|B|II)\b/i;

/** 按名称搜索成年国家队 (不受赛季限制), 排除青年/女足变体。 */
export async function searchTeam(name: string): Promise<{ id: number; name: string } | null> {
  const res = await afGet<AfTeamEntry>(`/teams?search=${encodeURIComponent(name)}`);
  if (res.length === 0) return null;
  const senior = res.filter((e) => e.team.national && !NON_SENIOR.test(e.team.name));
  const pool = senior.length ? senior : res.filter((e) => !NON_SENIOR.test(e.team.name));
  if (pool.length === 0) return null;
  // 优先精确名称匹配, 否则取池中第一个
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, '');
  const exact = pool.find((e) => norm(e.team.name) === norm(name));
  const pick = exact ?? pool[0];
  return { id: pick.team.id, name: pick.team.name };
}

/* ── 历史交锋 ──────────────────────────────────────────── */
export interface AfH2HFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { name: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

/** 两队历史交锋 (仅已结束有比分的)。 */
export async function fetchHeadToHead(idA: number, idB: number): Promise<AfH2HFixture[]> {
  const res = await afGet<AfH2HFixture>(`/fixtures/headtohead?h2h=${idA}-${idB}`);
  return res.filter(
    (f) => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short) && f.goals.home != null && f.goals.away != null,
  );
}

/* ── 赔率 (1X2 Match Winner) ───────────────────────────── */
interface AfOdds {
  fixture: { id: number };
  bookmakers: { id: number; name: string; bets: { name: string; values: { value: string; odd: string }[] }[] }[];
}

export interface ParsedOdds {
  externalId: string;
  bookmaker: string;
  homeWin: number;
  draw: number;
  awayWin: number;
}

/**
 * 拉取 1X2 赔率。整季 (无参) 或单场 (fixtureId)。
 * 每场取第一家给出 Match Winner 的博彩公司。
 */
export async function fetchOdds(fixtureId?: string | number): Promise<ParsedOdds[]> {
  const q = fixtureId
    ? `fixture=${fixtureId}`
    : `league=${config.apiFootball.leagueId}&season=${config.apiFootball.season}`;
  const res = await afGet<AfOdds>(`/odds?${q}`);
  const out: ParsedOdds[] = [];
  for (const r of res) {
    for (const bm of r.bookmakers) {
      const bet = bm.bets.find((b) => b.name === 'Match Winner');
      if (!bet) continue;
      const home = bet.values.find((v) => v.value === 'Home');
      const draw = bet.values.find((v) => v.value === 'Draw');
      const away = bet.values.find((v) => v.value === 'Away');
      if (!home || !draw || !away) continue;
      out.push({
        externalId: String(r.fixture.id),
        bookmaker: bm.name,
        homeWin: Number(home.odd),
        draw: Number(draw.odd),
        awayWin: Number(away.odd),
      });
      break; // 每场一家即可
    }
  }
  return out;
}

/* ── 伤病 / 停赛名单 ────────────────────────────────────────── */
export interface AfInjuryEntry {
  player: { id: number; name: string; type: string | null };
  team: { id: number; name: string };
  reason: string; // 'Injury' | 'Suspension'
}

/** 某场赛前伤病/停赛名单。失败或无数据返回 []（不中断同步）。 */
export async function fetchInjuries(fixtureId: string | number): Promise<AfInjuryEntry[]> {
  try {
    return await afGet<AfInjuryEntry>(`/injuries?fixture=${fixtureId}`);
  } catch {
    return [];
  }
}
