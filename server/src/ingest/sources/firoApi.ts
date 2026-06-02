/* ===========================================================
   数据源 · Firo API (firoapi.com)
   竞彩足球赛程 + 全玩法赔率 + 赛事综合情报。
   认证: RSA-SHA256 签名，X-API-Key / X-Signature / X-Timestamp 三头。
   签名串: apiKey={key}&timestamp={ts}[&{按键名排序的请求参数}]
   =========================================================== */
import { createSign, createPrivateKey, type KeyObject } from 'node:crypto';
import { config } from '../../config.js';
import { firoLogger } from '../../observability/logger.js';
import { recordFiroRequest } from '../../observability/metrics.js';

const BASE = 'https://www.firoapi.com';

/* ── 私钥单例 (避免每次请求重复解析) ──────────────────────── */
let _privKey: KeyObject | null = null;
function getPrivKey(): KeyObject {
  if (!_privKey) {
    if (!config.firo.privateKey) throw new Error('FIRO_PRIVATE_KEY 未配置');
    _privKey = createPrivateKey({
      key: Buffer.from(config.firo.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  }
  return _privKey;
}

/** RSA-SHA256 签名，返回 base64 字符串。 */
function rsaSign(str: string): string {
  return createSign('SHA256').update(str).sign(getPrivKey(), 'base64');
}

export function buildFiroSignString(
  apiKey: string,
  timestamp: string,
  params: Record<string, string | number> = {},
): string {
  const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return `apiKey=${apiKey}&timestamp=${timestamp}` + (sortedParams ? `&${sortedParams}` : '');
}

/**
 * 通用 GET 请求。
 * signParams: 需要参与签名的参数 (按文档，必填参数入签名，可选参数不入)。
 * queryParams: 实际发往 URL 的 query string (含 signParams)。
 */
async function firoGet<T>(
  path: string,
  signParams: Record<string, string | number> = {},
  queryParams: Record<string, string | number> = signParams,
): Promise<T> {
  if (!config.firo.apiKey) throw new Error('FIRO_API_KEY 未配置');

  const ts = Date.now().toString();
  const signStr = buildFiroSignString(config.firo.apiKey, ts, signParams);
  const sig = rsaSign(signStr);

  const qs = Object.keys(queryParams).sort().map(k => `${k}=${encodeURIComponent(queryParams[k])}`).join('&');
  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
  const startedAt = Date.now();
  let recorded = false;

  try {
    const res = await fetch(url, {
      headers: {
        'X-API-Key': config.firo.apiKey,
        'X-Signature': sig,
        'X-Timestamp': ts,
        'Accept': 'application/json',
      },
    });

    const json = (await res.json()) as { code: number; message: string; data: T };
    const ok = res.ok && json.code === 200 && json.data != null;
    const durationMs = Date.now() - startedAt;
    recordFiroRequest(durationMs, ok);
    recorded = true;
    firoLogger.info({ path, statusCode: res.status, code: json.code, durationMs }, 'firo_request');
    if (!ok) {
      throw new Error(`Firo API [${path}] 失败: ${json.message} (code=${json.code})`);
    }
    return json.data;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (!recorded) recordFiroRequest(durationMs, false);
    firoLogger.error({ path, durationMs, err }, 'firo_request_failed');
    throw err;
  }
}

/* ══════════════════════════════════════════════════════════
   类型定义
   ══════════════════════════════════════════════════════════ */

export interface FiroOddsEntry {
  matchId: number;
  poolCode: 'HAD' | 'HHAD' | 'HAFU' | 'TTG' | 'CRS' | string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  goalLine: string;    // "-1.00" | "" (让球数，胜平负类玩法为空)
  updateTime: string;
}

export interface FiroPoolStatus {
  matchId: number;
  poolCode: string;
  poolStatus: 'Selling' | 'Closed' | string;
  cbtSingle: 0 | 1;   // 1=支持单关
  cbtAllUp: 0 | 1;    // 1=支持过关
  updateTime: string;
}

export interface FiroMatchItem {
  matchMain: {
    matchId: number;
    matchNum: number;
    matchNumStr: string;        // "周二201"
    matchDate: string;          // "2026-06-02" 竞彩销售日期
    matchStartDate: string;     // 实际比赛日期
    matchTime: string;          // "00:00"
    sportType: string;
    leagueId: string;
    leagueName: string;
    leagueShort: string;
    homeTeamId: number;
    homeTeamName: string;
    homeTeamBadgeUrl: string;
    awayTeamId: number;
    awayTeamName: string;
    awayTeamBadgeUrl: string;
    matchStatus: string;        // "Selling" | "Closed" | "End"
    sellStatus: string;
    weekday: string;
    totalMatches: number;
    createTime: number;
    updateTime: string;
  };
  matchOddsList: FiroOddsEntry[];   // HAD / HHAD 实时赔率
  matchPoolList: FiroPoolStatus[];   // 各玩法开售状态
}

export interface FiroOddsRecord {
  homeWinOdds: number;
  homeWinFlag: -1 | 0 | 1;   // -1=降 0=平 1=升
  drawOdds: number;
  drawFlag: -1 | 0 | 1;
  awayWinOdds: number;
  awayWinFlag: -1 | 0 | 1;
  goalLine?: string;
  updateDate: string;
  updateTime: string;
}

export interface FiroOddsHistory {
  matchId: string;
  hadOddsList: FiroOddsRecord[];    // 胜平负历史
  hhadOddsList: FiroOddsRecord[];   // 让球胜平负历史
  hafuOddsList?: unknown[];         // 半全场历史 (后续按需结构化)
  ttgOddsList?: unknown[];          // 总进球历史 (后续按需结构化)
  crsOddsList?: unknown[];          // 比分历史 (后续按需结构化)
}

export interface FiroInjury {
  teamType: 'home' | 'away';
  playerName: string;
  position: string;
  jerseyNumber: string;
  isInjured: boolean;
  isSuspended: boolean;
}

export interface FiroPlayer {
  teamType: 'home' | 'away';
  playerName: string;
  position: string;
  jerseyNumber: string;
  appearances: number;
  starts: number;
  substitutes: number;
  goals: number;
  assists: number;
  isInjured: boolean;
  isSuspended: boolean;
}

export interface FiroRecentResult {
  matchDate: string;
  homeTeamName: string;
  awayTeamName: string;
  fullScore: string;   // "2:1"
  halfScore: string;
  tournamentName: string;
  winner: 'home' | 'away' | 'draw' | '';
}

export interface FiroFootballInfo {
  matchId: number;
  /** 两队交锋历史汇总 */
  history: {
    totalMatches: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: string;
    drawRate: string;
    lossRate: string;
    totalGoals: number;
    totalLossGoals: number;
    netGoals: number;
  };
  /** 主客场进攻特征 */
  feature: {
    homeTeamHomeWins: number;
    homeTeamHomeDraws: number;
    homeTeamHomeLosses: number;
    homeTeamHomeScoreRatio: string;   // "63" = 63%
    awayTeamAwayWins: number;
    awayTeamAwayDraws: number;
    awayTeamAwayLosses: number;
    awayTeamAwayScoreRatio: string;
    homeTeamAvgGoals: number;
    awayTeamAvgGoals: number;
    homeTeamAvgLossGoals: number;
    awayTeamAvgLossGoals: number;
  };
  injuries: FiroInjury[];
  players: FiroPlayer[];
  /** 近期战绩汇总 */
  result: {
    homeTeamWins: number;
    homeTeamDraws: number;
    homeTeamLosses: number;
    homeTeamTotalGoals: number;
    homeTeamTotalLossGoals: number;
    homeTeamWinRate: string;
    awayTeamWins: number;
    awayTeamDraws: number;
    awayTeamLosses: number;
    awayTeamTotalGoals: number;
    awayTeamTotalLossGoals: number;
    awayTeamWinRate: string;
  };
  /** 近期逐场战绩 */
  resultDetails: FiroRecentResult[];
}

export interface FiroSoccerEvent {
  idEvent: string;
  idLeague: string;
  strLeague: string;
  strSeason: string;
  idHomeTeam: string;
  strHomeTeam: string;
  idAwayTeam: string;
  strAwayTeam: string;
  strCountry: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  intRound: string | null;
  strStatus: string | null;
  strPostponed: string | null;
  strLocked: string | null;
  dateEventLocalBj: string;
  strTimeLocalBj: string;
  homeStrTeamZh: string;
  homeStrBadgeUrl: string;
  awayStrTeamZh: string;
  awayStrBadgeUrl: string;
  finishLeagueZh: string;
  shortLeagueZh: string;
  strCountryZh: string;
  badgeUrl: string;
  isJc: 0 | 1;
  matchId: number | null;
}

export interface FiroSoccerEventsResponse {
  date: string;
  matches: FiroSoccerEvent[];
}

/* ══════════════════════════════════════════════════════════
   公开 API 函数
   ══════════════════════════════════════════════════════════ */

/**
 * 当日竞彩足球赛程（含实时 HAD/HHAD 赔率 + 各玩法开售状态）。
 * 无需参数，服务端返回当期所有场次。
 */
export async function fetchLotteryList(): Promise<FiroMatchItem[]> {
  return firoGet<FiroMatchItem[]>('/firo/sports-lottery/list');
}

/**
 * 竞足赛程列表（全部赛事信息，支持日期查询）。
 * date: yyyy-MM-dd；不传时按服务端默认。
 */
export async function fetchLotteryAllList(date?: string): Promise<FiroMatchItem[]> {
  return firoGet<FiroMatchItem[]>(
    '/firo/sports-lottery/all-list',
    date ? { date } : {},
  );
}

/**
 * 单场赔率变动历史（HAD 胜平负 + HHAD 让球）。
 * matchId 必须参与签名。
 */
export async function fetchLotteryOdds(matchId: number): Promise<FiroOddsHistory> {
  return firoGet<FiroOddsHistory>(
    '/firo/sports-lottery/odds',
    { matchId },
  );
}

/**
 * 赛事综合情报：两队交锋历史、主客场特征、伤停名单、球员数据、近期战绩。
 * matchId 必须参与签名。
 */
export async function fetchFootballInfo(matchId: number): Promise<FiroFootballInfo> {
  return firoGet<FiroFootballInfo>(
    '/firo/sports-lottery/football-info',
    { matchId },
  );
}

/**
 * TheSportsDB 同步的足球按日赛程（北京日期）。
 * isJc: 1=仅竞彩, 0=仅非竞彩, undefined=全部。
 */
export async function fetchSoccerEvents(date?: string, isJc?: 0 | 1): Promise<FiroSoccerEventsResponse> {
  const params: Record<string, string | number> = {};
  if (date) params.date = date;
  if (isJc != null) params.isJc = isJc;
  return firoGet<FiroSoccerEventsResponse>('/firo/tsd/soccer-events', params);
}

/** Firo API 是否已配置。 */
export function firoAvailable(): boolean {
  return !!(config.firo.apiKey && config.firo.privateKey);
}
