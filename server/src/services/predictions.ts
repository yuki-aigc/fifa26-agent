import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { predictionRuns, predictions } from '../db/schema.js';
import type { MatchRow, PredictionRunRow } from '../db/schema.js';
import { odds, score, factors, h2h } from '../domain/elo.js';
import type { Prediction, Team, Factor } from '../domain/types.js';
import { predictWithAI, type Baseline } from '../ai/predictor.js';
import { streamPredictWithAI, type StreamEvent } from '../ai/streamPredictor.js';
import { aiInfo } from '../ai/pi.js';
import { getMatchWithTeams, matchView } from './matches.js';
import { getSquad } from './teams.js';
import { teamRecord } from './standings.js';
import { realH2H } from './h2h.js';
import { teamStatAverages, getTeamRestDays } from './stats.js';
import { latestOddsLine } from './odds.js';
import { getMatchInjuries } from './injuries.js';

const PROMPT_VERSION = 'v1';

function eloKeyFactors(fs: Factor[], home: Team, away: Team): string[] {
  return fs
    .filter((f) => f.lead !== 0 && f.label !== '世界排名')
    .sort((a, b) => Math.abs(b.pa - b.pb) - Math.abs(a.pa - a.pb))
    .slice(0, 3)
    .map((f) => `${f.lead === 1 ? home.name : away.name}${f.label}占优`);
}

function eloPrediction(home: Team, away: Team, baseline: Baseline): Prediction {
  return {
    engine: 'elo',
    win: baseline.odds.win,
    draw: baseline.odds.draw,
    loss: baseline.odds.loss,
    predScoreHome: baseline.score.a,
    predScoreAway: baseline.score.b,
    confidence: Math.max(baseline.odds.win, baseline.odds.draw, baseline.odds.loss),
    keyFactors: eloKeyFactors(baseline.factors, home, away),
    reasoning: '基于 Elo 逻辑模型,综合双方综合实力、攻防数据与近期状态推导胜平负概率与预测比分。',
  };
}

async function readCachedAi(matchId: string): Promise<Prediction | undefined> {
  const rows = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.matchId, matchId), eq(predictions.engine, 'ai'), eq(predictions.model, aiInfo.model)))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    engine: 'ai',
    provider: r.provider ?? undefined,
    model: r.model ?? undefined,
    win: r.win,
    draw: r.draw,
    loss: r.loss,
    predScoreHome: r.predScoreHome,
    predScoreAway: r.predScoreAway,
    confidence: r.confidence,
    keyFactors: r.keyFactors,
    reasoning: r.reasoning,
  };
}

async function writeCachedAi(matchId: string, p: Prediction): Promise<void> {
  await db
    .insert(predictions)
    .values({
      matchId,
      engine: 'ai',
      provider: p.provider ?? null,
      model: p.model ?? null,
      win: p.win,
      draw: p.draw,
      loss: p.loss,
      predScoreHome: p.predScoreHome,
      predScoreAway: p.predScoreAway,
      confidence: p.confidence,
      keyFactors: p.keyFactors,
      reasoning: p.reasoning,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [predictions.matchId, predictions.engine, predictions.model],
      set: {
        provider: p.provider ?? null,
        win: p.win,
        draw: p.draw,
        loss: p.loss,
        predScoreHome: p.predScoreHome,
        predScoreAway: p.predScoreAway,
        confidence: p.confidence,
        keyFactors: p.keyFactors,
        reasoning: p.reasoning,
        createdAt: new Date(),
      },
    });
}

function predictionPhase(match: MatchRow, createdAt = new Date()): 'pre_match' | 'live' | 'post_match' {
  if (match.status === 'finished') return 'post_match';
  if (match.status === 'live') return 'live';
  if (match.kickoff && createdAt >= match.kickoff) return 'live';
  return 'pre_match';
}

function buildInputSnapshot(args: {
  match: MatchRow;
  home: Team;
  away: Team;
  baseline: Baseline;
  homeRecord: unknown;
  awayRecord: unknown;
  homeStats: unknown;
  awayStats: unknown;
  oddsLine?: string;
  homeInjuries: unknown[];
  awayInjuries: unknown[];
  homeRestDays: number | null;
  awayRestDays: number | null;
}) {
  return {
    match: {
      id: args.match.id,
      stage: args.match.stage,
      kickoff: args.match.kickoff?.toISOString() ?? null,
      status: args.match.status,
    },
    teams: {
      home: { code: args.home.code, name: args.home.name, ovr: args.home.ovr },
      away: { code: args.away.code, name: args.away.name, ovr: args.away.ovr },
    },
    baseline: args.baseline,
    records: { home: args.homeRecord, away: args.awayRecord },
    teamStats: { home: args.homeStats, away: args.awayStats },
    oddsLine: args.oddsLine ?? null,
    injuries: {
      home: args.homeInjuries,
      away: args.awayInjuries,
    },
    restDays: {
      home: args.homeRestDays,
      away: args.awayRestDays,
    },
  };
}

async function writePredictionRun(args: {
  match: MatchRow;
  prediction: Prediction;
  inputSnapshot: unknown;
}): Promise<PredictionRunRow> {
  const createdAt = new Date();
  const phase = predictionPhase(args.match, createdAt);
  const eligibleForAccuracy = phase === 'pre_match';
  const provider = args.prediction.provider ?? (args.prediction.engine === 'ai' ? aiInfo.provider : '');
  const model = args.prediction.model ?? (args.prediction.engine === 'ai' ? aiInfo.model : '');
  if (eligibleForAccuracy) {
    await db
      .update(predictionRuns)
      .set({ isLatestEligible: false })
      .where(and(
        eq(predictionRuns.matchId, args.match.id),
        eq(predictionRuns.engine, args.prediction.engine),
        eq(predictionRuns.provider, provider),
        eq(predictionRuns.model, model),
        eq(predictionRuns.eligibleForAccuracy, true),
      ));
  }

  const rows = await db
    .insert(predictionRuns)
    .values({
      matchId: args.match.id,
      engine: args.prediction.engine,
      provider,
      model,
      promptVersion: PROMPT_VERSION,
      win: args.prediction.win,
      draw: args.prediction.draw,
      loss: args.prediction.loss,
      predScoreHome: args.prediction.predScoreHome,
      predScoreAway: args.prediction.predScoreAway,
      confidence: args.prediction.confidence,
      keyFactors: args.prediction.keyFactors,
      reasoning: args.prediction.reasoning,
      inputSnapshot: args.inputSnapshot,
      kickoffAt: args.match.kickoff ?? null,
      phase,
      eligibleForAccuracy,
      isLatestEligible: eligibleForAccuracy,
      createdAt,
    })
    .returning();
  return rows[0];
}

export async function listPredictionRuns(matchId: string): Promise<PredictionRunRow[]> {
  return db.select().from(predictionRuns).where(eq(predictionRuns.matchId, matchId)).orderBy(predictionRuns.createdAt);
}

export async function latestEligiblePredictionRuns(matchId: string): Promise<PredictionRunRow[]> {
  return db
    .select()
    .from(predictionRuns)
    .where(and(eq(predictionRuns.matchId, matchId), eq(predictionRuns.isLatestEligible, true)))
    .orderBy(predictionRuns.createdAt);
}

export async function getPrediction(matchId: string, opts: { ai?: boolean; refresh?: boolean } = {}) {
  const mwt = await getMatchWithTeams(matchId);
  if (!mwt) return undefined;
  const { match, home, away } = mwt;

  // 真实交锋优先 (跨届历史 + 本届已结束对阵), 无则回退 Elo 合成值。
  const real = await realH2H(home.code, away.code);
  const baseline: Baseline = {
    odds: odds(home, away),
    score: score(home, away),
    factors: factors(home, away),
    h2h: real.real ? { total: real.total, aw: real.aw, dr: real.dr, bw: real.bw } : h2h(home, away),
  };

  // 真实表现因素 (供详情页展示 + AI 先验)。
  const [homeRecord, awayRecord, homeStats, awayStats, oddsLine,
         homeInjuries, awayInjuries, homeRestDays, awayRestDays] = await Promise.all([
    teamRecord(home.code),
    teamRecord(away.code),
    teamStatAverages(home.code),
    teamStatAverages(away.code),
    latestOddsLine(matchId, home.name, away.name),
    getMatchInjuries(matchId, home.code),
    getMatchInjuries(matchId, away.code),
    match.kickoff ? getTeamRestDays(home.code, match.kickoff) : Promise.resolve(null),
    match.kickoff ? getTeamRestDays(away.code, match.kickoff) : Promise.resolve(null),
  ]);

  let prediction = eloPrediction(home, away, baseline);
  let usedAi = false;

  if (opts.ai) {
    const cached = opts.refresh ? undefined : await readCachedAi(matchId);
    if (cached) {
      prediction = cached;
      usedAi = true;
    } else {
      const [homePlayers, awayPlayers] = await Promise.all([getSquad(home.code), getSquad(away.code)]);
      const aiPred = await predictWithAI({
        home,
        away,
        homePlayers,
        awayPlayers,
        stage: match.stage,
        baseline,
        homeRecord,
        awayRecord,
        homeStats,
        awayStats,
        oddsLine: oddsLine?.text,
        homeInjuries,
        awayInjuries,
        homeRestDays,
        awayRestDays,
      });
      if (aiPred) {
        await writeCachedAi(matchId, aiPred);
        await writePredictionRun({
          match,
          prediction: aiPred,
          inputSnapshot: buildInputSnapshot({
            match,
            home,
            away,
            baseline,
            homeRecord,
            awayRecord,
            homeStats,
            awayStats,
            oddsLine: oddsLine?.text,
            homeInjuries,
            awayInjuries,
            homeRestDays,
            awayRestDays,
          }),
        });
        prediction = aiPred;
        usedAi = true;
      }
    }
  }

  return {
    match: matchView(match, home, away),
    baseline,
    prediction,
    // 真实表现数据 (前端/iOS 可直接消费)
    records: { home: homeRecord, away: awayRecord },
    teamStats: { home: homeStats, away: awayStats },
    h2hReal: real.real,
    h2hRecent: real.recent, // 最近交锋 (含日期/赛事/比分)
    odds: oddsLine?.odds ?? null,
    ai: usedAi,
    aiRequested: !!opts.ai,
    aiFallback: !!opts.ai && !usedAi, // 请求了 AI 但回退到 Elo (无 key/失败)
  };
}

/* ── 流式预测 (SSE 用) ──────────────────────────── */
export type PredictionStreamEvent =
  | { type: 'baseline'; baseline: Baseline; match: ReturnType<typeof matchView> }
  | StreamEvent;

export async function* streamPrediction(
  matchId: string,
  opts: { refresh?: boolean } = {},
): AsyncGenerator<PredictionStreamEvent> {
  const mwt = await getMatchWithTeams(matchId);
  if (!mwt) {
    yield { type: 'error', message: 'match_not_found' };
    return;
  }
  const { match, home, away } = mwt;

  const real = await realH2H(home.code, away.code);
  const baseline: Baseline = {
    odds: odds(home, away),
    score: score(home, away),
    factors: factors(home, away),
    h2h: real.real ? { total: real.total, aw: real.aw, dr: real.dr, bw: real.bw } : h2h(home, away),
  };

  yield { type: 'baseline', baseline, match: matchView(match, home, away) };

  const cached = opts.refresh ? undefined : await readCachedAi(matchId);
  if (cached) {
    yield { type: 'prediction', prediction: cached };
    yield { type: 'done' };
    return;
  }

  const [homeRecord, awayRecord, homeStats, awayStats, oddsLine,
         homeInjuries, awayInjuries, homeRestDays, awayRestDays,
         homePlayers, awayPlayers] = await Promise.all([
    teamRecord(home.code),
    teamRecord(away.code),
    teamStatAverages(home.code),
    teamStatAverages(away.code),
    latestOddsLine(matchId, home.name, away.name),
    getMatchInjuries(matchId, home.code),
    getMatchInjuries(matchId, away.code),
    match.kickoff ? getTeamRestDays(home.code, match.kickoff) : Promise.resolve(null),
    match.kickoff ? getTeamRestDays(away.code, match.kickoff) : Promise.resolve(null),
    getSquad(home.code),
    getSquad(away.code),
  ]);

  for await (const event of streamPredictWithAI({
    home, away, homePlayers, awayPlayers,
    stage: match.stage, baseline,
    homeRecord, awayRecord, homeStats, awayStats,
    oddsLine: oddsLine?.text,
    homeInjuries, awayInjuries, homeRestDays, awayRestDays,
  })) {
    yield event;
    if (event.type === 'prediction') {
      await writeCachedAi(matchId, event.prediction);
      await writePredictionRun({
        match,
        prediction: event.prediction,
        inputSnapshot: buildInputSnapshot({
          match,
          home,
          away,
          baseline,
          homeRecord,
          awayRecord,
          homeStats,
          awayStats,
          oddsLine: oddsLine?.text,
          homeInjuries,
          awayInjuries,
          homeRestDays,
          awayRestDays,
        }),
      });
    }
  }
}
