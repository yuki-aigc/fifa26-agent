import { afterEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matches, predictionRuns, predictions, teams } from '../db/schema.js';
import { accuracySummary, gradeMatch } from './accuracy.js';

const testMatchId = '2099-12-31-TAA-TBB';
const testTeams = ['TAA', 'TBB'];

describe('prediction run accuracy', () => {
  afterEach(async () => {
    await db.delete(predictionRuns).where(eq(predictionRuns.matchId, testMatchId));
    await db.delete(predictions).where(eq(predictions.matchId, testMatchId));
    await db.delete(matches).where(eq(matches.id, testMatchId));
    await db.delete(teams).where(inArray(teams.code, testTeams));
  });

  async function seedFinishedMatch() {
    await db.insert(teams).values([
      { code: 'TAA', name: '测试甲', en: 'Test A', group: 'Z' },
      { code: 'TBB', name: '测试乙', en: 'Test B', group: 'Z' },
    ]).onConflictDoNothing();
    await db.insert(matches).values({
      id: testMatchId,
      homeCode: 'TAA',
      awayCode: 'TBB',
      stage: '测试赛',
      kickoff: new Date('2099-12-31T10:00:00Z'),
      status: 'finished',
      homeScore: 2,
      awayScore: 0,
    });
  }

  it('grades only the latest eligible pre-match prediction run per model', async () => {
    await seedFinishedMatch();
    await db.insert(predictionRuns).values([
      {
        matchId: testMatchId,
        engine: 'ai',
        provider: 'test-provider',
        model: 'test-model',
        win: 10,
        draw: 20,
        loss: 70,
        predScoreHome: 0,
        predScoreAway: 1,
        confidence: 70,
        keyFactors: [],
        reasoning: 'older wrong run',
        kickoffAt: new Date('2099-12-31T10:00:00Z'),
        phase: 'pre_match',
        eligibleForAccuracy: true,
        isLatestEligible: false,
        createdAt: new Date('2099-12-30T09:00:00Z'),
      },
      {
        matchId: testMatchId,
        engine: 'ai',
        provider: 'test-provider',
        model: 'test-model',
        win: 70,
        draw: 20,
        loss: 10,
        predScoreHome: 2,
        predScoreAway: 0,
        confidence: 70,
        keyFactors: [],
        reasoning: 'latest correct run',
        kickoffAt: new Date('2099-12-31T10:00:00Z'),
        phase: 'pre_match',
        eligibleForAccuracy: true,
        isLatestEligible: true,
        createdAt: new Date('2099-12-30T12:00:00Z'),
      },
      {
        matchId: testMatchId,
        engine: 'ai',
        provider: 'test-provider',
        model: 'test-model',
        win: 5,
        draw: 10,
        loss: 85,
        predScoreHome: 0,
        predScoreAway: 3,
        confidence: 85,
        keyFactors: [],
        reasoning: 'live run excluded',
        kickoffAt: new Date('2099-12-31T10:00:00Z'),
        phase: 'live',
        eligibleForAccuracy: false,
        isLatestEligible: false,
        createdAt: new Date('2099-12-31T10:10:00Z'),
      },
    ]);

    await expect(gradeMatch(testMatchId)).resolves.toBe(1);

    const runs = await db.select().from(predictionRuns).where(eq(predictionRuns.matchId, testMatchId));
    expect(runs.filter((r) => r.gradedAt)).toHaveLength(1);
    expect(runs.find((r) => r.isLatestEligible)?.correctOutcome).toBe(true);
    expect(runs.find((r) => r.isLatestEligible)?.correctScore).toBe(true);
    expect(runs.find((r) => r.isLatestEligible)?.brierScore).toBeGreaterThan(0);
    expect(runs.find((r) => r.isLatestEligible)?.logLoss).toBeGreaterThan(0);

    const summary = await accuracySummary();
    const bucket = summary.find((s) => s.provider === 'test-provider' && s.model === 'test-model');
    expect(bucket).toMatchObject({
      engine: 'ai',
      graded: 1,
      outcomeHit: 1,
      scoreHit: 1,
      outcomeRate: 100,
      scoreRate: 100,
    });
  });
});
