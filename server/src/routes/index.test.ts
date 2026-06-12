import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from '../index.js';
import { db } from '../db/client.js';
import { lotteryAnalyses, lotteryMatches, lotteryOddsSnapshots, lotteryPicks } from '../db/schema.js';
import { resetMetricsForTest } from '../observability/metrics.js';

const routeTestFiroMatchId = 909900001;

describe('routes observability', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetMetricsForTest();
    app = await buildApp();
  });

  afterEach(async () => {
    await db.delete(lotteryPicks).where(eq(lotteryPicks.firoMatchId, routeTestFiroMatchId));
    await db.delete(lotteryAnalyses).where(eq(lotteryAnalyses.firoMatchId, routeTestFiroMatchId));
    await db.delete(lotteryOddsSnapshots).where(eq(lotteryOddsSnapshots.firoMatchId, routeTestFiroMatchId));
    await db.delete(lotteryMatches).where(eq(lotteryMatches.firoMatchId, routeTestFiroMatchId));
    await app.close();
  });

  it('returns health status with database and config checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe('ok');
    expect(body.checks).toHaveProperty('firoConfigured');
    expect(body.checks).toHaveProperty('aiConfigured');
  });

  it('exposes in-memory metrics and includes injected requests', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.http_requests_total['GET /health:200']).toBe(1);
    expect(body).toHaveProperty('memory_rss_mb');
    expect(body).toHaveProperty('firo_requests_total');
  });

  it('serves lottery matches from DB before depending on Firo', async () => {
    await db.insert(lotteryMatches).values({
      firoMatchId: routeTestFiroMatchId,
      matchId: null,
      matchNumStr: '周五001',
      matchDate: '2099-01-01',
      matchStartDate: '2099-01-01',
      matchTime: '03:00',
      leagueName: '世界杯',
      leagueShort: '世界杯',
      homeTeamName: '加拿大',
      awayTeamName: '波黑',
      matchStatus: 'Selling',
      sellStatus: 'Selling',
      poolStatus: [],
      raw: {
        matchMain: {
          matchId: routeTestFiroMatchId,
          matchNum: 1,
          matchNumStr: '周五001',
          matchDate: '2099-01-01',
          matchStartDate: '2099-01-01',
          matchTime: '03:00',
          leagueName: '世界杯',
          leagueShort: '世界杯',
          homeTeamName: '加拿大',
          awayTeamName: '波黑',
        },
        matchOddsList: [],
        matchPoolList: [],
      },
    }).onConflictDoNothing();

    const res = await app.inject({ method: 'GET', url: '/api/lottery/matches?date=2099-01-01' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].matchMain.matchId).toBe(routeTestFiroMatchId);
  });

  it('returns stable lottery accuracy summary shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/lottery/accuracy' });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(body.summary)).toBe(true);
  });

  it('returns persisted latest lottery analysis in match detail', async () => {
    await db.insert(lotteryMatches).values({
      firoMatchId: routeTestFiroMatchId,
      matchId: null,
      matchNumStr: '周五001',
      matchDate: '2099-01-01',
      matchStartDate: '2099-01-01',
      matchTime: '03:00',
      leagueName: '世界杯',
      leagueShort: '世界杯',
      homeTeamName: '加拿大',
      awayTeamName: '波黑',
      matchStatus: 'Selling',
      sellStatus: 'Selling',
      poolStatus: [],
      raw: {
        matchMain: {
          matchId: routeTestFiroMatchId,
          matchNum: 1,
          matchNumStr: '周五001',
          matchDate: '2099-01-01',
          matchStartDate: '2099-01-01',
          matchTime: '03:00',
          leagueName: '世界杯',
          leagueShort: '世界杯',
          homeTeamName: '加拿大',
          awayTeamName: '波黑',
        },
        matchOddsList: [],
        matchPoolList: [],
      },
    }).onConflictDoNothing();
    const inserted = await db.insert(lotteryAnalyses).values({
      firoMatchId: routeTestFiroMatchId,
      matchId: null,
      provider: 'openai',
      model: 'test-model',
      recommendation: '稳健主胜',
      confidence: 72,
      reasoning: '测试分析已落库。',
      raw: { suggestions: ['HAD: 主胜'] },
    }).returning();
    await db.insert(lotteryPicks).values({
      analysisId: inserted[0].id,
      firoMatchId: routeTestFiroMatchId,
      matchId: null,
      tier: '稳健',
      poolCode: 'HAD',
      optionCode: 'HOME',
      optionLabel: '主胜',
      odds: 1.8,
      reason: '测试理由',
      raw: {},
    });
    const oddsTime = new Date();
    await db.insert(lotteryOddsSnapshots).values([
      {
        firoMatchId: routeTestFiroMatchId,
        matchId: null,
        poolCode: 'HAD',
        optionCode: 'HOME',
        optionLabel: '主胜',
        odds: 1.8,
        updateTime: oddsTime,
        capturedAt: oddsTime,
        raw: {},
      },
      {
        firoMatchId: routeTestFiroMatchId,
        matchId: null,
        poolCode: 'HAD',
        optionCode: 'DRAW',
        optionLabel: '平',
        odds: 3.2,
        updateTime: oddsTime,
        capturedAt: oddsTime,
        raw: {},
      },
      {
        firoMatchId: routeTestFiroMatchId,
        matchId: null,
        poolCode: 'HAD',
        optionCode: 'AWAY',
        optionLabel: '客胜',
        odds: 4.1,
        updateTime: oddsTime,
        capturedAt: oddsTime,
        raw: {},
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/api/lottery/matches/${routeTestFiroMatchId}` });
    const body = res.json();

    expect(res.statusCode).toBe(200);
    expect(body.info).toBeNull();
    expect(body.oddsHistory.hadOddsList).toHaveLength(1);
    expect(body.latestAnalysis).toMatchObject({
      analysisId: inserted[0].id,
      recommendation: '稳健主胜',
      confidence: 72,
      suggestions: ['HAD: 主胜'],
    });
    expect(body.latestAnalysis.picks).toHaveLength(1);
    expect(body.latestAnalysis.picks[0]).toMatchObject({ tier: '稳健', poolCode: 'HAD', optionLabel: '主胜' });
  });
});
