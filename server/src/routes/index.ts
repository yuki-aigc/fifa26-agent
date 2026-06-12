import type { FastifyInstance } from 'fastify';
import { listTeams, getTeamDetail } from '../services/teams.js';
import { listPlayers, getPlayer } from '../services/players.js';
import { listMatches, getMatchWithTeams, matchView, matchDetail } from '../services/matches.js';
import { getPrediction, streamPrediction } from '../services/predictions.js';
import { accuracySummary } from '../services/accuracy.js';
import { aiInfo, aiKeyAvailable } from '../ai/pi.js';
import { config } from '../config.js';
import { sqlite } from '../db/client.js';
import { fetchLotteryAllList, fetchLotteryList, fetchLotteryOdds, fetchFootballInfo, firoAvailable } from '../ingest/sources/firoApi.js';
import { analyzeLotteryMatch, streamLotteryAnalysis } from '../services/lotteryAnalysis.js';
import { addLotteryMatchesServed, metricsSnapshot } from '../observability/metrics.js';
import { evaluateAlertStatus } from '../observability/alerts.js';
import { onMatchEvent } from '../services/eventBus.js';
import { runTournamentSimulation } from '../services/tournament.js';
import {
  buildStoredOddsHistory,
  getStoredLotteryMatch,
  listStoredLotteryMatches,
  persistLotteryAnalysis,
  upsertLotteryOddsHistory,
  upsertWorldCupLotteryItems,
} from '../services/lotteryStore.js';
import { lotteryAccuracySummary } from '../services/lotteryAccuracy.js';

export async function registerRoutes(app: FastifyInstance) {
  async function fetchWorldCupLotteryMatches(date?: string, refresh = false) {
    const stored = await listStoredLotteryMatches(date);
    if (!refresh && stored.length > 0) return stored;

    if (!firoAvailable()) return stored;

    try {
      const rows = date ? await fetchLotteryAllList(date) : await fetchLotteryList();
      const { matches } = await upsertWorldCupLotteryItems(rows);
      return matches.length ? matches : stored;
    } catch (err) {
      app.log.warn({ err, date }, 'lottery_matches_refresh_failed');
      return stored;
    }
  }

  async function loadLotteryMatch(firoMatchId: number, refresh = false) {
    const stored = await getStoredLotteryMatch(firoMatchId);
    if (!refresh && stored?.match) return stored;

    const refreshed = await fetchWorldCupLotteryMatches(undefined, refresh);
    const match = refreshed.find((m) => m.matchMain.matchId === firoMatchId);
    if (match) return getStoredLotteryMatch(firoMatchId);
    return stored;
  }

  app.get('/health', async () => {
    let dbOk = true;
    try {
      sqlite.prepare('select 1 as ok').get();
    } catch {
      dbOk = false;
    }
    const metrics = metricsSnapshot();

    return {
      ok: dbOk,
      status: dbOk ? 'ok' : 'degraded',
      version: '1.0.0',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database: dbOk ? 'ok' : 'failed',
        firoConfigured: firoAvailable(),
        aiConfigured: aiKeyAvailable(),
      },
      ai: { provider: aiInfo.provider, model: aiInfo.model, baseUrl: aiInfo.baseUrl, keyConfigured: aiKeyAvailable() },
      sync: {
        enabled: config.sync.enabled,
        intervalMin: config.sync.intervalMin,
        mode: config.sync.mode,
        apiFootballKey: !!config.apiFootball.key,
        firoEnabled: config.sync.firoEnabled,
        firoIntervalMin: config.sync.firoIntervalMin,
        firoDays: config.sync.firoDays,
      },
      firo: { keyConfigured: firoAvailable() },
      metrics: {
        uptime_seconds: metrics.uptime_seconds,
        memory_rss_mb: metrics.memory_rss_mb,
      },
    };
  });

  app.get('/api/metrics', async () => {
    const metrics = metricsSnapshot();
    return { ...metrics, alerts: evaluateAlertStatus(metrics) };
  });

  /* ── Accuracy (预测对账) ── */
  app.get('/api/accuracy', async () => {
    const summary = await accuracySummary();
    return { summary };
  });

  /* ── Teams ── */
  app.get('/api/teams', async () => {
    const teams = await listTeams();
    return { teams };
  });

  app.get<{ Params: { code: string } }>('/api/teams/:code', async (req, reply) => {
    const detail = await getTeamDetail(req.params.code.toUpperCase());
    if (!detail) return reply.code(404).send({ error: 'team_not_found' });
    return detail;
  });

  /* ── Players ── */
  app.get<{ Querystring: { position?: string; limit?: string } }>('/api/players', async (req) => {
    const players = await listPlayers({
      position: req.query.position?.toUpperCase(),
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return { players };
  });

  app.get<{ Params: { id: string } }>('/api/players/:id', async (req, reply) => {
    const player = await getPlayer(Number(req.params.id));
    if (!player) return reply.code(404).send({ error: 'player_not_found' });
    return player;
  });

  /* ── Matches ── */
  app.get<{ Querystring: { status?: string; group?: string } }>('/api/matches', async (req) => {
    const rows = await listMatches({ status: req.query.status, group: req.query.group?.toUpperCase() });
    const views = await Promise.all(
      rows.map(async (m) => {
        const mwt = await getMatchWithTeams(m.id);
        return mwt ? matchView(mwt.match, mwt.home, mwt.away) : null;
      }),
    );
    return { matches: views.filter(Boolean) };
  });

  app.get<{ Params: { id: string } }>('/api/matches/:id', async (req, reply) => {
    const detail = await matchDetail(req.params.id);
    if (!detail) return reply.code(404).send({ error: 'match_not_found' });
    return detail;
  });

  /* ── Prediction (Elo baseline + optional AI) ── */
  app.get<{ Params: { id: string }; Querystring: { ai?: string; refresh?: string } }>(
    '/api/matches/:id/prediction',
    async (req, reply) => {
      const ai = req.query.ai === '1' || req.query.ai === 'true';
      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const result = await getPrediction(req.params.id, { ai, refresh });
      if (!result) return reply.code(404).send({ error: 'match_not_found' });
      return result;
    },
  );

  /* ── Tournament simulation ── */
  app.get<{ Querystring: { iterations?: string } }>('/api/tournament/simulation', async (req) => {
    const iterations = Math.min(50000, Math.max(1000, Number(req.query.iterations) || 10000));
    return runTournamentSimulation(iterations);
  });

  /* ── SSE: AI 流式预测 ── */
  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/matches/:id/prediction/stream',
    async (req, reply) => {
      const origin = req.headers.origin;
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      });

      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const write = (event: object) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      try {
        for await (const event of streamPrediction(req.params.id, { refresh })) {
          write(event);
        }
      } catch (err) {
        write({ type: 'error', message: (err as Error).message });
      }

      reply.raw.end();
    },
  );

  /* ── SSE: 赛事实时推送 ── */
  app.get('/api/events/matches', async (req, reply) => {
    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    });
    reply.raw.write(':ok\n\n');

    const heartbeat = setInterval(() => {
      reply.raw.write(':ping\n\n');
    }, 30_000);

    const unsub = onMatchEvent((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });

  /* ── Lottery (竞彩数据 via Firo API) ── */
  app.get<{ Querystring: { date?: string; refresh?: string } }>('/api/lottery/matches', async (req, reply) => {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const matches = await fetchWorldCupLotteryMatches(req.query.date, refresh);
    if (!matches.length && !firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    addLotteryMatchesServed(matches.length);
    return { matches };
  });

  app.get('/api/lottery/accuracy', async () => {
    return { summary: await lotteryAccuracySummary() };
  });

  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>('/api/lottery/matches/:id', async (req, reply) => {
    const matchId = Number(req.params.id);
    if (!matchId) return reply.code(400).send({ error: 'invalid_match_id' });
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const stored = await loadLotteryMatch(matchId, refresh);
    if (!stored) return reply.code(404).send({ error: 'world_cup_match_not_found' });

    let info = null;
    let oddsHistory = await buildStoredOddsHistory(matchId);
    if (firoAvailable()) {
      try {
        const [nextInfo, nextOddsHistory] = await Promise.all([
          fetchFootballInfo(matchId),
          fetchLotteryOdds(matchId),
        ]);
        info = nextInfo;
        oddsHistory = nextOddsHistory;
        await upsertLotteryOddsHistory(matchId, stored.row.matchId, nextOddsHistory);
      } catch (err) {
        app.log.warn({ err, matchId }, 'lottery_detail_firo_refresh_failed');
      }
    }

    return { matchId, match: stored.match, info, oddsHistory };
  });

  app.get<{ Params: { id: string } }>('/api/lottery/matches/:id/analysis', async (req, reply) => {
    if (!firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    const matchId = Number(req.params.id);
    if (!matchId) return reply.code(400).send({ error: 'invalid_match_id' });

    // 只从世界杯过滤后的竞彩列表中查找单场。
    const stored = await loadLotteryMatch(matchId);
    if (!stored?.match) return reply.code(404).send({ error: 'world_cup_match_not_found' });

    const [info, oddsHistory] = await Promise.all([
      fetchFootballInfo(matchId),
      fetchLotteryOdds(matchId),
    ]);
    await upsertLotteryOddsHistory(matchId, stored.row.matchId, oddsHistory);
    const result = await analyzeLotteryMatch(stored.match, info, oddsHistory);
    if (!result) return reply.code(503).send({ error: 'ai_not_available' });
    const analysis = await persistLotteryAnalysis({
      result,
      firoMatchId: matchId,
      matchId: stored.row.matchId,
    });
    return { ...result, analysisId: analysis.id };
  });

  /* ── SSE: 竞彩 AI 流式分析 ── */
  app.get<{ Params: { id: string } }>('/api/lottery/matches/:id/analysis/stream', async (req, reply) => {
    if (!firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    const matchId = Number(req.params.id);
    if (!matchId) return reply.code(400).send({ error: 'invalid_match_id' });

    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    });

    const stored = await loadLotteryMatch(matchId);
    if (!stored?.match) {
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: 'world_cup_match_not_found' })}\n\n`);
      reply.raw.end();
      return;
    }

    const [info, oddsHistory] = await Promise.all([
      fetchFootballInfo(matchId),
      fetchLotteryOdds(matchId),
    ]);
    await upsertLotteryOddsHistory(matchId, stored.row.matchId, oddsHistory);

    const write = (event: object) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      for await (const event of streamLotteryAnalysis(stored.match, info, oddsHistory)) {
        if (event.type === 'analysis') {
          const analysis = await persistLotteryAnalysis({
            result: event.analysis,
            firoMatchId: matchId,
            matchId: stored.row.matchId,
          });
          event.analysis = { ...event.analysis, analysisId: analysis.id } as typeof event.analysis;
        }
        write(event);
      }
    } catch (err) {
      write({ type: 'error', message: (err as Error).message });
    }
    reply.raw.end();
  });
}
