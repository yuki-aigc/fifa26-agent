import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { predictions } from '../db/schema.js';
import { odds, score, factors, h2h } from '../domain/elo.js';
import type { Prediction, Team, Factor } from '../domain/types.js';
import { predictWithAI, type Baseline } from '../ai/predictor.js';
import { aiInfo } from '../ai/pi.js';
import { getMatchWithTeams, matchView } from './matches.js';
import { getSquad } from './teams.js';
import { teamRecord } from './standings.js';
import { realH2H } from './h2h.js';
import { teamStatAverages, getTeamRestDays } from './stats.js';
import { latestOddsLine } from './odds.js';
import { getMatchInjuries } from './injuries.js';

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
