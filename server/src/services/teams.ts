import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams, players } from '../db/schema.js';
import { toRadar, type Team, type Player } from '../domain/types.js';

export async function listTeams(): Promise<Team[]> {
  return db.select().from(teams).orderBy(desc(teams.ovr), asc(teams.rank));
}

export async function getTeamRow(code: string): Promise<Team | undefined> {
  const rows = await db.select().from(teams).where(eq(teams.code, code)).limit(1);
  return rows[0];
}

export async function getSquad(code: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.teamCode, code)).orderBy(desc(players.ovr));
}

export function playerView(p: Player) {
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    num: p.num,
    age: p.age,
    club: p.club,
    ovr: p.ovr,
    radar: toRadar(p),
  };
}

export async function getTeamDetail(code: string) {
  const team = await getTeamRow(code);
  if (!team) return undefined;
  const squad = await getSquad(code);
  return { ...team, squad: squad.map(playerView) };
}
