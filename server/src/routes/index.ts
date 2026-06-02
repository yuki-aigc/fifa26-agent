import type { FastifyInstance } from 'fastify';
import { listTeams, getTeamDetail } from '../services/teams.js';
import { listPlayers, getPlayer } from '../services/players.js';
import { listMatches, getMatchWithTeams, matchView, matchDetail } from '../services/matches.js';
import { getPrediction } from '../services/predictions.js';
import { accuracySummary } from '../services/accuracy.js';
import { aiInfo, aiKeyAvailable } from '../ai/pi.js';
import { config } from '../config.js';

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    time: new Date().toISOString(),
    ai: { provider: aiInfo.provider, model: aiInfo.model, baseUrl: aiInfo.baseUrl, keyConfigured: aiKeyAvailable() },
    sync: {
      enabled: config.sync.enabled,
      intervalMin: config.sync.intervalMin,
      mode: config.sync.mode,
      apiFootballKey: !!config.apiFootball.key,
    },
  }));

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
}
