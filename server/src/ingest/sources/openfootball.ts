/* ===========================================================
   数据源 · OpenFootball worldcup.json (免费, 公共领域)
   https://github.com/openfootball/worldcup.json
   提供 FIFA26的 48 队身份/分组/旗帜 + 全部 104 场赛程。
   =========================================================== */
const BASE = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026';

export interface OfTeam {
  name: string;
  name_normalised?: string;
  continent?: string;
  flag_icon?: string;
  fifa_code: string;
  group?: string;
  confed?: string;
}

export interface OfMatch {
  round: string;
  date: string; // 2026-06-11
  time: string; // "13:00 UTC-6"
  team1: string;
  team2: string;
  group?: string; // "Group A"
  ground?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenFootball fetch failed (${res.status}): ${url}`);
  return (await res.json()) as T;
}

export async function fetchTeams(): Promise<OfTeam[]> {
  return getJson<OfTeam[]>(`${BASE}/worldcup.teams.json`);
}

export async function fetchMatches(): Promise<OfMatch[]> {
  const data = await getJson<{ matches: OfMatch[] }>(`${BASE}/worldcup.json`);
  return data.matches ?? [];
}
