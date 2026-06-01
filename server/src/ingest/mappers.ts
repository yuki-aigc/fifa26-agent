/* ===========================================================
   摄取映射工具
   - 球队名 -> FIFA 三字码
   - OpenFootball 比赛 -> 我们的 match 行 (kickoff/stage/group)
   - FC26 属性 -> 五维面板
   =========================================================== */
import type { OfTeam, OfMatch } from './sources/openfootball.js';

/** 由 OpenFootball 队列表构建 名称(含归一名) -> fifa_code 的查找表。 */
export function buildNameToCode(teams: OfTeam[]): Map<string, string> {
  const m = new Map<string, string>();
  const add = (name: string | undefined, code: string) => {
    if (name) m.set(name.trim().toLowerCase(), code);
  };
  for (const t of teams) {
    add(t.name, t.fifa_code);
    add(t.name_normalised, t.fifa_code);
  }
  return m;
}

export function codeForName(name: string, nameToCode: Map<string, string>): string | undefined {
  return nameToCode.get(name.trim().toLowerCase());
}

/** "Group A" -> "A"; 其它返回 undefined。 */
export function groupLetter(group?: string): string | undefined {
  if (!group) return undefined;
  const m = group.match(/group\s+([A-L])/i);
  return m ? m[1].toUpperCase() : undefined;
}

const KNOCKOUT_ZH: Record<string, string> = {
  'round of 32': '32强淘汰赛',
  'round of 16': '16强淘汰赛',
  'quarter-final': '四分之一决赛',
  'quarter-finals': '四分之一决赛',
  'semi-final': '半决赛',
  'semi-finals': '半决赛',
  'match for third place': '三四名决赛',
  'third place play-off': '三四名决赛',
  final: '决赛',
};

/** 生成中文 stage 标签。 */
export function stageLabel(round: string, group?: string): string {
  const g = groupLetter(group);
  if (g) return `小组赛 ${g}组`;
  const key = round.trim().toLowerCase();
  return KNOCKOUT_ZH[key] ?? round;
}

/**
 * 解析 OpenFootball 的 date+time -> UTC 毫秒。
 * time 形如 "13:00 UTC-6" / "19:00 UTC-4"。无法解析时返回 null。
 */
export function parseKickoff(date: string, time?: string): number | null {
  if (!date) return null;
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const [, ys, mos, ds] = dm;
  let hh = 12;
  let mm = 0;
  let offsetHours = 0;
  if (time) {
    const tm = time.match(/(\d{1,2}):(\d{2})/);
    if (tm) {
      hh = Number(tm[1]);
      mm = Number(tm[2]);
    }
    const om = time.match(/UTC([+-]\d{1,2})/i);
    if (om) offsetHours = Number(om[1]);
  }
  // local = UTC + offset  =>  UTC = local - offset
  const asUtc = Date.UTC(Number(ys), Number(mos) - 1, Number(ds), hh, mm);
  return asUtc - offsetHours * 3600 * 1000;
}

/** 稳定的 match id slug。 */
export function matchId(date: string, homeCode: string, awayCode: string): string {
  return `${date}-${homeCode}-${awayCode}`;
}

export interface MappedMatch {
  id: string;
  homeCode: string;
  awayCode: string;
  stage: string;
  round: string;
  group?: string;
  venue: string;
  kickoff: Date | null;
}

/** 将 OpenFootball 比赛映射到我们的 schema; 无法解析双方代码时返回 null。 */
export function mapMatch(m: OfMatch, nameToCode: Map<string, string>): MappedMatch | null {
  const homeCode = codeForName(m.team1, nameToCode);
  const awayCode = codeForName(m.team2, nameToCode);
  if (!homeCode || !awayCode) return null; // 淘汰赛占位 (如 "Winner Group A") 跳过
  const kickoffMs = parseKickoff(m.date, m.time);
  return {
    id: matchId(m.date, homeCode, awayCode),
    homeCode,
    awayCode,
    stage: stageLabel(m.round, m.group),
    round: m.round,
    group: groupLetter(m.group),
    venue: m.ground ?? '',
    kickoff: kickoffMs == null ? null : new Date(kickoffMs),
  };
}

/* ── FC26 / EA Sports 属性 -> 五维面板 ─────────────────────
   pace->速度, shooting->射门, passing->传球, defending->防守, physic->体能
   门将使用 GK 专属字段做合理映射 (pace/shooting 取较低代理值)。           */
export interface Fc26Attrs {
  pace?: number;
  shooting?: number;
  passing?: number;
  dribbling?: number;
  defending?: number;
  physic?: number;
  overall?: number;
  position?: string;
  // GK
  gkDiving?: number;
  gkHandling?: number;
  gkKicking?: number;
  gkReflexes?: number;
  gkPositioning?: number;
}

export interface RadarAttrs {
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  stamina: number;
  ovr: number;
}

export function mapFc26ToRadar(a: Fc26Attrs): RadarAttrs {
  const isGk = (a.position ?? '').toUpperCase().includes('GK') || a.gkReflexes != null;
  if (isGk) {
    return {
      pace: Math.round((a.gkPositioning ?? 60)),
      shooting: a.gkKicking ?? 30,
      passing: a.gkKicking ?? 70,
      defending: Math.round(((a.gkReflexes ?? 80) + (a.gkPositioning ?? 80)) / 2),
      stamina: a.gkHandling ?? 80,
      ovr: a.overall ?? 80,
    };
  }
  return {
    pace: a.pace ?? 70,
    shooting: a.shooting ?? 70,
    passing: a.passing ?? 70,
    defending: a.defending ?? 70,
    stamina: a.physic ?? 70,
    ovr: a.overall ?? 75,
  };
}
