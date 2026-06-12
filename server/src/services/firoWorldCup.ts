import { db } from '../db/client.js';
import { matches, teams } from '../db/schema.js';
import type { FiroMatchItem, FiroSoccerEvent } from '../ingest/sources/firoApi.js';

type MatchRow = typeof matches.$inferSelect;
type TeamRow = typeof teams.$inferSelect;

export interface FiroWorldCupContext {
  matchRows: MatchRow[];
  nameToCode: Map<string, string>;
}

export interface FiroWorldCupHit {
  match: MatchRow;
  reversed: boolean;
  gap: number;
}

const TEAM_ALIASES: Record<string, string[]> = {
  BIH: ['Bosnia and Herzegovina', 'Bosnia-Herzegovina', '波斯尼亚和黑塞哥维那'],
  CAN: ['加拿大'],
  CIV: ['Cote d Ivoire', 'Côte d’Ivoire', 'Côte d Ivoire', '象牙海岸'],
  COD: ['Congo DR', 'Congo-Kinshasa', 'DRC', '民主刚果', '刚果金', '刚果民主共和国'],
  CPV: ['Cabo Verde'],
  CUW: ['Curacao'],
  CZE: ['Czechia', '捷克共和国'],
  ENG: ['England National Team', '英格兰队'],
  KOR: ['Korea Republic', 'Republic of Korea', 'South Korea Republic', '南韩'],
  KSA: ['Saudi', 'Saudi Arabia National Team', '沙特'],
  NED: ['Holland'],
  RSA: ['South Africa National Team'],
  SUI: ['Swiss'],
  TUR: ['Türkiye', 'Turkiye'],
  USA: ['United States', 'United States of America', 'USMNT', '美国队'],
};

export function normFiroTeamName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function addName(map: Map<string, string>, name: string | null | undefined, code: string) {
  if (!name) return;
  map.set(normFiroTeamName(name), code);
}

export function buildFiroNameToCode(teamRows: TeamRow[]): Map<string, string> {
  const nameToCode = new Map<string, string>();
  for (const team of teamRows) {
    addName(nameToCode, team.code, team.code);
    addName(nameToCode, team.name, team.code);
    addName(nameToCode, team.en, team.code);
    for (const alias of TEAM_ALIASES[team.code] ?? []) addName(nameToCode, alias, team.code);
  }
  return nameToCode;
}

export async function loadFiroWorldCupContext(): Promise<FiroWorldCupContext> {
  const [teamRows, matchRows] = await Promise.all([
    db.select().from(teams),
    db.select().from(matches),
  ]);
  return {
    matchRows,
    nameToCode: buildFiroNameToCode(teamRows),
  };
}

export function parseFiroKickoff(item: FiroMatchItem): Date | null {
  const date = item.matchMain.matchStartDate || item.matchMain.matchDate;
  const time = item.matchMain.matchTime;
  if (!date || !time) return null;
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFiroEventKickoff(event: FiroSoccerEvent): Date | null {
  const date = event.dateEventLocalBj;
  const time = event.strTimeLocalBj;
  if (!date || !time) return null;
  const d = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function findFiroWorldCupMatch(args: {
  homeName: string;
  awayName: string;
  kickoff: Date | null;
  context: FiroWorldCupContext;
}): FiroWorldCupHit | null {
  const homeCode = args.context.nameToCode.get(normFiroTeamName(args.homeName));
  const awayCode = args.context.nameToCode.get(normFiroTeamName(args.awayName));
  if (!homeCode || !awayCode) return null;

  const candidates = args.context.matchRows
    .map((match) => {
      const same = match.homeCode === homeCode && match.awayCode === awayCode;
      const reversed = match.homeCode === awayCode && match.awayCode === homeCode;
      if (!same && !reversed) return null;
      const gap = args.kickoff && match.kickoff ? Math.abs(match.kickoff.getTime() - args.kickoff.getTime()) : 0;
      return { match, reversed, gap };
    })
    .filter((x): x is FiroWorldCupHit => !!x)
    .sort((a, b) => a.gap - b.gap);

  const hit = candidates[0];
  if (!hit || (args.kickoff && hit.match.kickoff && hit.gap > 48 * 60 * 60 * 1000)) return null;
  return hit;
}

export function matchFiroLotteryItem(item: FiroMatchItem, context: FiroWorldCupContext): FiroWorldCupHit | null {
  return findFiroWorldCupMatch({
    homeName: item.matchMain.homeTeamName,
    awayName: item.matchMain.awayTeamName,
    kickoff: parseFiroKickoff(item),
    context,
  });
}

export function matchFiroSoccerEvent(event: FiroSoccerEvent, context: FiroWorldCupContext): FiroWorldCupHit | null {
  return findFiroWorldCupMatch({
    homeName: event.homeStrTeamZh || event.strHomeTeam,
    awayName: event.awayStrTeamZh || event.strAwayTeam,
    kickoff: parseFiroEventKickoff(event),
    context,
  });
}

export async function filterWorldCupLotteryItems(items: FiroMatchItem[]): Promise<FiroMatchItem[]> {
  const context = await loadFiroWorldCupContext();
  return items.filter((item) => !!matchFiroLotteryItem(item, context));
}
