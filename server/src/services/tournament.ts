import { db } from '../db/client.js';
import { teams as teamsTable, matches as matchesTable } from '../db/schema.js';
import { odds, score } from '../domain/elo.js';
import type { Team } from '../domain/types.js';

export interface TeamProgression {
  code: string;
  name: string;
  flag: string;
  group: string;
  qualify: number;
  roundOf32: number;
  roundOf16: number;
  quarterFinal: number;
  semiFinal: number;
  final: number;
  champion: number;
}

export interface SimulationResult {
  teams: TeamProgression[];
  iterations: number;
  computedAt: string;
}

interface GroupStanding {
  code: string;
  pts: number;
  gd: number;
  gf: number;
}

let cache: { result: SimulationResult; expiry: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function runTournamentSimulation(iterations = 10000): Promise<SimulationResult> {
  if (cache && Date.now() < cache.expiry) return cache.result;

  const allTeams = await db.select().from(teamsTable);
  const allMatches = await db.select().from(matchesTable);

  const teamMap = new Map<string, Team>();
  for (const t of allTeams) teamMap.set(t.code, t);

  const groups = new Map<string, string[]>();
  for (const t of allTeams) {
    const g = t.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t.code);
  }

  const groupMatches = allMatches.filter((m) => m.group != null);
  const finishedGroupMatches = groupMatches.filter((m) => m.status === 'finished');
  const unplayedGroupMatches = groupMatches.filter((m) => m.status !== 'finished');

  const counters = new Map<string, { qualify: number; r32: number; r16: number; qf: number; sf: number; final: number; champ: number }>();
  for (const t of allTeams) {
    counters.set(t.code, { qualify: 0, r32: 0, r16: 0, qf: 0, sf: 0, final: 0, champ: 0 });
  }

  for (let i = 0; i < iterations; i++) {
    const standings = simulateGroupStage(groups, finishedGroupMatches, unplayedGroupMatches, teamMap);
    const qualified = determineQualifiers(standings, groups);

    for (const code of qualified) {
      counters.get(code)!.qualify++;
    }

    simulateKnockout(qualified, teamMap, counters);
  }

  const result: SimulationResult = {
    iterations,
    computedAt: new Date().toISOString(),
    teams: allTeams.map((t) => {
      const c = counters.get(t.code)!;
      return {
        code: t.code,
        name: t.name,
        flag: t.flagEmoji ?? '',
        group: t.group,
        qualify: round2(c.qualify / iterations * 100),
        roundOf32: round2(c.r32 / iterations * 100),
        roundOf16: round2(c.r16 / iterations * 100),
        quarterFinal: round2(c.qf / iterations * 100),
        semiFinal: round2(c.sf / iterations * 100),
        final: round2(c.final / iterations * 100),
        champion: round2(c.champ / iterations * 100),
      };
    }).sort((a, b) => b.champion - a.champion || b.final - a.final || b.qualify - a.qualify),
  };

  cache = { result, expiry: Date.now() + CACHE_TTL };
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function simulateGroupStage(
  groups: Map<string, string[]>,
  finished: typeof import('../db/schema.js').matches.$inferSelect[],
  unplayed: typeof import('../db/schema.js').matches.$inferSelect[],
  teamMap: Map<string, Team>,
): Map<string, GroupStanding[]> {
  const standings = new Map<string, GroupStanding[]>();

  for (const [g, codes] of groups) {
    const st = new Map<string, GroupStanding>();
    for (const code of codes) {
      st.set(code, { code, pts: 0, gd: 0, gf: 0 });
    }

    for (const m of finished) {
      if (m.group !== g) continue;
      const h = st.get(m.homeCode);
      const a = st.get(m.awayCode);
      if (!h || !a) continue;
      const hs = m.homeScore ?? 0;
      const as_ = m.awayScore ?? 0;
      applyResult(h, a, hs, as_);
    }

    for (const m of unplayed) {
      if (m.group !== g) continue;
      const h = st.get(m.homeCode);
      const a = st.get(m.awayCode);
      if (!h || !a) continue;
      const tH = teamMap.get(m.homeCode);
      const tA = teamMap.get(m.awayCode);
      if (!tH || !tA) continue;
      const [hs, as_] = simulateScore(tH, tA);
      applyResult(h, a, hs, as_);
    }

    const sorted = [...st.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    standings.set(g, sorted);
  }

  return standings;
}

function applyResult(h: GroupStanding, a: GroupStanding, hs: number, as_: number): void {
  h.gf += hs;
  h.gd += hs - as_;
  a.gf += as_;
  a.gd += as_ - hs;
  if (hs > as_) { h.pts += 3; }
  else if (hs === as_) { h.pts += 1; a.pts += 1; }
  else { a.pts += 3; }
}

function simulateScore(A: Team, B: Team): [number, number] {
  const o = odds(A, B);
  const s = score(A, B);
  const jitter = () => Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
  let ha = Math.max(0, s.a + jitter());
  let hb = Math.max(0, s.b + jitter());

  const roll = Math.random() * 100;
  if (roll < o.win && ha <= hb) ha = hb + 1;
  else if (roll >= o.win + o.draw && hb <= ha) hb = ha + 1;
  else if (roll >= o.win && roll < o.win + o.draw && ha !== hb) {
    ha = Math.min(ha, hb);
    hb = ha;
  }

  return [ha, hb];
}

function simulateKnockoutMatch(A: Team, B: Team): string {
  const o = odds(A, B);
  const roll = Math.random() * 100;
  if (roll < o.win) return A.code;
  if (roll < o.win + o.draw) {
    return Math.random() < 0.5 + (A.ovr - B.ovr) / 200 ? A.code : B.code;
  }
  return B.code;
}

function determineQualifiers(
  standings: Map<string, GroupStanding[]>,
  groups: Map<string, string[]>,
): string[] {
  const top2: string[] = [];
  const thirds: GroupStanding[] = [];

  const sortedGroups = [...groups.keys()].sort();
  for (const g of sortedGroups) {
    const st = standings.get(g)!;
    top2.push(st[0].code, st[1].code);
    if (st[2]) thirds.push(st[2]);
  }

  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const best3rd = thirds.slice(0, 8).map((t) => t.code);

  return [...top2, ...best3rd];
}

function simulateKnockout(
  qualified: string[],
  teamMap: Map<string, Team>,
  counters: Map<string, { qualify: number; r32: number; r16: number; qf: number; sf: number; final: number; champ: number }>,
): void {
  let round = qualified.slice();

  for (const code of round) counters.get(code)!.r32++;

  // Round of 32 → 16
  let winners = playRound(round, teamMap);
  for (const code of winners) counters.get(code)!.r16++;

  // Round of 16 → 8
  winners = playRound(winners, teamMap);
  for (const code of winners) counters.get(code)!.qf++;

  // Quarterfinals → 4
  winners = playRound(winners, teamMap);
  for (const code of winners) counters.get(code)!.sf++;

  // Semifinals → 2
  winners = playRound(winners, teamMap);
  for (const code of winners) counters.get(code)!.final++;

  // Final → 1
  winners = playRound(winners, teamMap);
  for (const code of winners) counters.get(code)!.champ++;
}

function playRound(teams: string[], teamMap: Map<string, Team>): string[] {
  const winners: string[] = [];
  for (let i = 0; i < teams.length - 1; i += 2) {
    const tA = teamMap.get(teams[i]);
    const tB = teamMap.get(teams[i + 1]);
    if (!tA || !tB) {
      winners.push(teams[i]);
      continue;
    }
    winners.push(simulateKnockoutMatch(tA, tB));
  }
  if (teams.length % 2 === 1) {
    winners.push(teams[teams.length - 1]);
  }
  return winners;
}
