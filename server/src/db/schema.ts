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
  apiId: integer('api_id'), // API-Football team id (用于 H2H / 实时对齐)
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
    elapsed: integer('elapsed'), // 比赛进行分钟 (live only)
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    externalId: text('external_id'), // api-football fixture id
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byKickoff: index('matches_kickoff_idx').on(t.kickoff),
    byGroup: index('matches_group_idx').on(t.group),
    byStatus: index('matches_status_idx').on(t.status),
    byExternal: index('matches_external_idx').on(t.externalId),
  }),
);

/* ── Match stats (per-team performance, for AI + history) ── */
export const matchStats = sqliteTable(
  'match_stats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: text('match_id').notNull().references(() => matches.id),
    teamCode: text('team_code').notNull().references(() => teams.code),
    isHome: integer('is_home', { mode: 'boolean' }).notNull(),
    goals: integer('goals'), // 进球 (冗余存,便于派生战绩)
    possession: real('possession'), // 控球率 %
    shots: integer('shots'),
    shotsOnTarget: integer('shots_on_target'),
    xg: real('xg'), // 预期进球
    corners: integer('corners'),
    fouls: integer('fouls'),
    yellow: integer('yellow'),
    red: integer('red'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniquePerTeam: uniqueIndex('match_stats_match_team_idx').on(t.matchId, t.teamCode),
    byMatch: index('match_stats_match_idx').on(t.matchId),
    byTeam: index('match_stats_team_idx').on(t.teamCode),
  }),
);

/* ── Injuries / Suspensions (per-match, per-team) ─────────── */
export const injuries = sqliteTable(
  'injuries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: text('match_id').notNull().references(() => matches.id),
    teamCode: text('team_code').notNull().references(() => teams.code),
    playerName: text('player_name').notNull(),
    reason: text('reason').notNull(), // 'Injury' | 'Suspension'
    playerPos: text('player_pos'), // 'FW' | 'MF' | 'DF' | 'GK' | null
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniquePerPlayer: uniqueIndex('injuries_match_team_player_idx').on(t.matchId, t.teamCode, t.playerName),
    byMatch: index('injuries_match_idx').on(t.matchId),
    byTeam: index('injuries_team_idx').on(t.teamCode),
  }),
);

/* ── Odds (1X2 market odds time series) ───────────────────── */
export const odds = sqliteTable(
  'odds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    matchId: text('match_id').notNull().references(() => matches.id),
    bookmaker: text('bookmaker').notNull().default(''),
    homeWin: real('home_win').notNull(), // decimal odds
    draw: real('draw').notNull(),
    awayWin: real('away_win').notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byMatch: index('odds_match_idx').on(t.matchId),
    byCapture: index('odds_capture_idx').on(t.matchId, t.capturedAt),
  }),
);

/* ── Lottery/Firo snapshots (World Cup filtered) ─────────── */
export const lotteryMatches = sqliteTable(
  'lottery_matches',
  {
    firoMatchId: integer('firo_match_id').primaryKey(),
    matchId: text('match_id').references(() => matches.id),
    matchNumStr: text('match_num_str').notNull().default(''),
    matchDate: text('match_date').notNull().default(''),
    matchStartDate: text('match_start_date').notNull().default(''),
    matchTime: text('match_time').notNull().default(''),
    leagueName: text('league_name').notNull().default(''),
    leagueShort: text('league_short').notNull().default(''),
    homeTeamName: text('home_team_name').notNull().default(''),
    awayTeamName: text('away_team_name').notNull().default(''),
    matchStatus: text('match_status').notNull().default(''),
    sellStatus: text('sell_status').notNull().default(''),
    poolStatus: text('pool_status', { mode: 'json' }).$type<unknown>().notNull().default(sql`'[]'`),
    raw: text('raw', { mode: 'json' }).$type<unknown>().notNull().default(sql`'{}'`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byMatch: index('lottery_matches_match_idx').on(t.matchId),
    byDate: index('lottery_matches_date_idx').on(t.matchStartDate),
  }),
);

export const lotteryOddsSnapshots = sqliteTable(
  'lottery_odds_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firoMatchId: integer('firo_match_id').notNull().references(() => lotteryMatches.firoMatchId),
    matchId: text('match_id').references(() => matches.id),
    poolCode: text('pool_code').notNull(),
    optionCode: text('option_code').notNull(),
    optionLabel: text('option_label').notNull(),
    odds: real('odds').notNull(),
    goalLine: text('goal_line').notNull().default(''),
    updateTime: integer('update_time', { mode: 'timestamp_ms' }).notNull(),
    capturedAt: integer('captured_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    source: text('source').notNull().default('firo'),
    raw: text('raw', { mode: 'json' }).$type<unknown>().notNull().default(sql`'{}'`),
  },
  (t) => ({
    uniqueSnapshot: uniqueIndex('lottery_odds_snapshot_unique_idx').on(t.firoMatchId, t.poolCode, t.optionCode, t.goalLine, t.updateTime),
    byFiroMatch: index('lottery_odds_firo_match_idx').on(t.firoMatchId),
    byMatch: index('lottery_odds_match_idx').on(t.matchId),
    byPool: index('lottery_odds_pool_idx').on(t.poolCode),
    byCapture: index('lottery_odds_capture_idx').on(t.firoMatchId, t.capturedAt),
  }),
);

export const lotteryAnalyses = sqliteTable(
  'lottery_analyses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firoMatchId: integer('firo_match_id').notNull().references(() => lotteryMatches.firoMatchId),
    matchId: text('match_id').references(() => matches.id),
    provider: text('provider').notNull().default(''),
    model: text('model').notNull().default(''),
    recommendation: text('recommendation').notNull().default(''),
    confidence: integer('confidence').notNull().default(0),
    reasoning: text('reasoning').notNull().default(''),
    raw: text('raw', { mode: 'json' }).$type<unknown>().notNull().default(sql`'{}'`),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    gradedAt: integer('graded_at', { mode: 'timestamp_ms' }),
    roiOneUnit: real('roi_one_unit'),
  },
  (t) => ({
    byFiroMatch: index('lottery_analyses_firo_match_idx').on(t.firoMatchId),
    byMatch: index('lottery_analyses_match_idx').on(t.matchId),
    byModel: index('lottery_analyses_model_idx').on(t.provider, t.model),
  }),
);

export const lotteryPicks = sqliteTable(
  'lottery_picks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    analysisId: integer('analysis_id').notNull().references(() => lotteryAnalyses.id),
    firoMatchId: integer('firo_match_id').notNull().references(() => lotteryMatches.firoMatchId),
    matchId: text('match_id').references(() => matches.id),
    tier: text('tier').notNull().default('unknown'),
    poolCode: text('pool_code').notNull().default(''),
    optionCode: text('option_code').notNull().default(''),
    optionLabel: text('option_label').notNull().default(''),
    odds: real('odds'),
    modelProbability: real('model_probability'),
    ev: real('ev'),
    stakeFraction: real('stake_fraction'),
    reason: text('reason').notNull().default(''),
    isHit: integer('is_hit', { mode: 'boolean' }),
    profitOneUnit: real('profit_one_unit'),
    gradedAt: integer('graded_at', { mode: 'timestamp_ms' }),
    raw: text('raw', { mode: 'json' }).$type<unknown>().notNull().default(sql`'{}'`),
  },
  (t) => ({
    byAnalysis: index('lottery_picks_analysis_idx').on(t.analysisId),
    byMatch: index('lottery_picks_match_idx').on(t.matchId),
    byPool: index('lottery_picks_pool_idx').on(t.poolCode),
    byTier: index('lottery_picks_tier_idx').on(t.tier),
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
    // ── 对账 (比赛结束后回填) ──
    correctOutcome: integer('correct_outcome', { mode: 'boolean' }), // 胜平负是否命中
    correctScore: integer('correct_score', { mode: 'boolean' }), // 精确比分是否命中
    gradedAt: integer('graded_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    uniqueCache: uniqueIndex('predictions_cache_idx').on(t.matchId, t.engine, t.model),
  }),
);

/* ── Head-to-head (真实历史交锋) ──────────────────────────
   规范化存储: aCode < bCode (字典序), 读取时按主队视角翻转。
   来源 API-Football /fixtures/headtohead。 */
export const h2hMatches = sqliteTable(
  'h2h_matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    aCode: text('a_code').notNull().references(() => teams.code), // 规范化较小 code
    bCode: text('b_code').notNull().references(() => teams.code),
    playedOn: text('played_on').notNull(), // YYYY-MM-DD
    aScore: integer('a_score').notNull(),
    bScore: integer('b_score').notNull(),
    competition: text('competition').notNull().default(''),
    externalId: text('external_id'), // api-football fixture id (去重用)
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byPair: index('h2h_pair_idx').on(t.aCode, t.bCode),
    uniqueFixture: uniqueIndex('h2h_fixture_idx').on(t.externalId),
  }),
);

/* ── H2H 抓取登记 (避免重复打接口, 区分"已查无交锋"与"未查") ── */
export const h2hPairs = sqliteTable(
  'h2h_pairs',
  {
    aCode: text('a_code').notNull().references(() => teams.code),
    bCode: text('b_code').notNull().references(() => teams.code),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`),
    meetings: integer('meetings').notNull().default(0),
  },
  (t) => ({
    pk: uniqueIndex('h2h_pairs_pk').on(t.aCode, t.bCode),
  }),
);

export type TeamRow = typeof teams.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type PredictionRow = typeof predictions.$inferSelect;
export type MatchStatsRow = typeof matchStats.$inferSelect;
export type InjuryRow = typeof injuries.$inferSelect;
export type OddsRow = typeof odds.$inferSelect;
export type LotteryMatchRow = typeof lotteryMatches.$inferSelect;
export type LotteryOddsSnapshotRow = typeof lotteryOddsSnapshots.$inferSelect;
export type LotteryAnalysisRow = typeof lotteryAnalyses.$inferSelect;
export type LotteryPickRow = typeof lotteryPicks.$inferSelect;
export type H2hMatchRow = typeof h2hMatches.$inferSelect;
