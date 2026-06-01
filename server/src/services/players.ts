import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { players, teams } from '../db/schema.js';
import { toRadar } from '../domain/types.js';

const POS = new Set(['FW', 'MF', 'DF', 'GK']);

export async function listPlayers(opts: { position?: string; limit?: number } = {}) {
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      pos: players.pos,
      num: players.num,
      age: players.age,
      club: players.club,
      ovr: players.ovr,
      pace: players.pace,
      shooting: players.shooting,
      passing: players.passing,
      defending: players.defending,
      stamina: players.stamina,
      teamCode: players.teamCode,
      teamName: teams.name,
      teamEn: teams.en,
      flagEmoji: teams.flagEmoji,
    })
    .from(players)
    .innerJoin(teams, eq(players.teamCode, teams.code))
    .orderBy(desc(players.ovr));

  let list = rows;
  if (opts.position && POS.has(opts.position)) list = rows.filter((r) => r.pos === opts.position);
  if (opts.limit) list = list.slice(0, opts.limit);

  return list.map((r) => ({
    id: r.id,
    name: r.name,
    pos: r.pos,
    num: r.num,
    age: r.age,
    club: r.club,
    ovr: r.ovr,
    radar: toRadar(r),
    team: { code: r.teamCode, name: r.teamName, en: r.teamEn, flagEmoji: r.flagEmoji },
  }));
}

export async function getPlayer(id: number) {
  const rows = await db
    .select()
    .from(players)
    .innerJoin(teams, eq(players.teamCode, teams.code))
    .where(eq(players.id, id))
    .limit(1);
  if (!rows[0]) return undefined;
  const { players: p, teams: t } = rows[0];
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    num: p.num,
    age: p.age,
    club: p.club,
    ovr: p.ovr,
    radar: toRadar(p),
    team: { code: t.code, name: t.name, en: t.en, flagEmoji: t.flagEmoji, accent: t.accent },
  };
}
