import type { FastifyInstance } from 'fastify';
import { listTeams, getTeamDetail } from '../services/teams.js';
import { listPlayers, getPlayer } from '../services/players.js';
import { listMatches, getMatchWithTeams, matchView, matchDetail } from '../services/matches.js';
import { getPrediction } from '../services/predictions.js';
import { accuracySummary } from '../services/accuracy.js';
import { aiInfo, aiKeyAvailable } from '../ai/pi.js';
import { config } from '../config.js';
import { sqlite } from '../db/client.js';
import { fetchLotteryList, fetchLotteryOdds, fetchFootballInfo, firoAvailable } from '../ingest/sources/firoApi.js';
import { analyzeLotteryMatch } from '../services/lotteryAnalysis.js';
import { addLotteryMatchesServed, metricsSnapshot } from '../observability/metrics.js';
import { evaluateAlertStatus } from '../observability/alerts.js';

export async function registerRoutes(app: FastifyInstance) {
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

  /* ── Lottery (竞彩数据 via Firo API) ── */
  app.get('/api/lottery/matches', async (_req, reply) => {
    if (!firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    const matches = await fetchLotteryList();
    addLotteryMatchesServed(matches.length);
    return { matches };
  });

  app.get<{ Params: { id: string } }>('/api/lottery/matches/:id', async (req, reply) => {
    if (!firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    const matchId = Number(req.params.id);
    if (!matchId) return reply.code(400).send({ error: 'invalid_match_id' });
    const [info, oddsHistory] = await Promise.all([
      fetchFootballInfo(matchId),
      fetchLotteryOdds(matchId),
    ]);
    return { matchId, info, oddsHistory };
  });

  app.get<{ Params: { id: string } }>('/api/lottery/matches/:id/analysis', async (req, reply) => {
    if (!firoAvailable()) return reply.code(503).send({ error: 'firo_not_configured' });
    const matchId = Number(req.params.id);
    if (!matchId) return reply.code(400).send({ error: 'invalid_match_id' });

    // 拉全量数据 (赛程列表 + 单场数据)
    const [matches, info, oddsHistory] = await Promise.all([
      fetchLotteryList(),
      fetchFootballInfo(matchId),
      fetchLotteryOdds(matchId),
    ]);
    const match = matches.find((m) => m.matchMain.matchId === matchId);
    if (!match) return reply.code(404).send({ error: 'match_not_found_in_lottery_list' });

    const result = await analyzeLotteryMatch(match, info, oddsHistory);
    if (!result) return reply.code(503).send({ error: 'ai_not_available' });
    return result;
  });
}
