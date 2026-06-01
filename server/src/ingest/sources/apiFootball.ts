/* ===========================================================
   数据源 · API-Football (api-sports.io) — 仅用于比赛实时比分/状态
   免费档 100 次/天。需要 API_FOOTBALL_KEY (见 .env)。
   种子流程完全不依赖此源。
   =========================================================== */
import { config } from '../../config.js';

const BASE = 'https://v3.football.api-sports.io';

export interface AfFixture {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

/** API-Football 状态码 -> 我们的状态。 */
export function mapStatus(short: string): 'scheduled' | 'live' | 'finished' {
  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(short)) return 'live';
  if (['FT', 'AET', 'PEN', 'WO'].includes(short)) return 'finished';
  return 'scheduled';
}

export async function fetchFixtures(): Promise<AfFixture[]> {
  if (!config.apiFootball.key) throw new Error('API_FOOTBALL_KEY 未配置');
  const url = `${BASE}/fixtures?league=${config.apiFootball.leagueId}&season=${config.apiFootball.season}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': config.apiFootball.key } });
  if (!res.ok) throw new Error(`API-Football 请求失败 (${res.status})`);
  const json = (await res.json()) as { response?: AfFixture[]; errors?: unknown };
  if (!json.response) throw new Error(`API-Football 返回异常: ${JSON.stringify(json.errors ?? json)}`);
  return json.response;
}
