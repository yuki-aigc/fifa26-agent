import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/* ── Teams ──────────────────────────────────────────────── */
export const teams = sqliteTable('teams', {
  code: text('code').primaryKey(), // FIFA 3-letter code, e.g. ARG
  name: text('name').notNull(), // 中文名
  en: text('en').notNull(), // English name
  group: text('group').notNull(), // A..L
  confed: text('confed'), // CONMEBOL / UEFA / ...
  flagEmoji: text('flag_emoji'),
  accent: text('accent').notNull().default('#19c8b9'),
  rank: integer('rank').notNull().default(99),
  fifaPoints: real('fifa_points').notNull().default(0),
  ovr: integer('ovr').notNull().default(75),
  att: integer('att').notNull().default(75),
  mid: integer('mid').notNull().default(75),
  def: integer('def').notNull().default(75),
  form: text('form', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  titles: integer('titles').notNull().default(0),
  note: text('note').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
});

/* ── Players ────────────────────────────────────────────── */
export const players = sqliteTable(
  'players',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamCode: text('team_code').notNull().references(() => teams.code),
    name: text('name').notNull(),
    pos: text('pos').notNull(), // FW / MF / DF / GK
    num: integer('num').notNull().default(0),
    age: integer('age').notNull().default(0),
    club: text('club').notNull().default(''),
    // 五维面板 radar attributes
    pace: integer('pace').notNull().default(70), // 速度
    shooting: integer('shooting').notNull().default(70), // 射门
    passing: integer('passing').notNull().default(70), // 传球
    defending: integer('defending').notNull().default(70), // 防守
    stamina: integer('stamina').notNull().default(70), // 体能
    ovr: integer('ovr').notNull().default(75),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byTeam: index('players_team_idx').on(t.teamCode),
    uniquePerTeam: uniqueIndex('players_team_name_idx').on(t.teamCode, t.name),
  }),
);

/* ── Matches ────────────────────────────────────────────── */
export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(), // stable slug, e.g. "2026-06-11-MEX-RSA"
    homeCode: text('home_code').notNull().references(() => teams.code),
    awayCode: text('away_code').notNull().references(() => teams.code),
    stage: text('stage').notNull(), // zh label, e.g. "小组赛 A组"
    round: text('round'), // raw round, e.g. "Matchday 1"
    group: text('group'), // A..L (null for knockout)
    venue: text('venue').notNull().default(''),
    kickoff: integer('kickoff', { mode: 'timestamp_ms' }), // UTC kickoff
    status: text('status').notNull().default('scheduled'), // scheduled | live | finished
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    externalId: text('external_id'), // api-football fixture id
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byKickoff: index('matches_kickoff_idx').on(t.kickoff),
    byGroup: index('matches_group_idx').on(t.group),
  }),
);

/* ── Predictions (AI cache) ─────────────────────────────── */
export const predictions = sqliteTable(
  'predictions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: text('match_id').notNull().references(() => matches.id),
    engine: text('engine').notNull(), // 'elo' | 'ai'
    provider: text('provider'), // anthropic | openai (ai only)
    model: text('model'), // model id (ai only)
    win: integer('win').notNull(),
    draw: integer('draw').notNull(),
    loss: integer('loss').notNull(),
    predScoreHome: integer('pred_score_home').notNull(),
    predScoreAway: integer('pred_score_away').notNull(),
    confidence: integer('confidence').notNull(),
    keyFactors: text('key_factors', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    reasoning: text('reasoning').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqueCache: uniqueIndex('predictions_cache_idx').on(t.matchId, t.engine, t.model),
  }),
);

export type TeamRow = typeof teams.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type PredictionRow = typeof predictions.$inferSelect;
