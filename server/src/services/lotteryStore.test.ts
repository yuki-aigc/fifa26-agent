import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { lotteryMatches, lotteryOddsSnapshots } from '../db/schema.js';
import {
  parseMatchOddsSnapshots,
  parseOddsHistorySnapshots,
  listStoredLotteryMatches,
  upsertLotteryEvent,
  upsertLotteryMatch,
} from './lotteryStore.js';
import type { FiroMatchItem, FiroOddsHistory, FiroSoccerEvent } from '../ingest/sources/firoApi.js';

const testFiroMatchId = 909900002;

function sampleMatchItem(): FiroMatchItem {
  return {
    matchMain: {
      matchId: testFiroMatchId,
      matchNum: 1,
      matchNumStr: '周五001',
      matchDate: '2099-01-01',
      matchStartDate: '2099-01-01',
      matchTime: '03:00',
      sportType: '足球',
      leagueId: 'wc',
      leagueName: '世界杯',
      leagueShort: '世界杯',
      homeTeamId: 1,
      homeTeamName: '加拿大',
      homeTeamBadgeUrl: '',
      awayTeamId: 2,
      awayTeamName: '波黑',
      awayTeamBadgeUrl: '',
      matchStatus: 'Selling',
      sellStatus: 'Selling',
      weekday: '周五',
      totalMatches: 1,
      createTime: 0,
      updateTime: '2099-01-01T01:00:00+08:00',
    },
    matchOddsList: [
      {
        matchId: testFiroMatchId,
        poolCode: 'HAD',
        homeOdds: 1.8,
        drawOdds: 3.2,
        awayOdds: 4.1,
        goalLine: '',
        updateTime: '2099-01-01T01:00:00+08:00',
      },
      {
        matchId: testFiroMatchId,
        poolCode: 'HHAD',
        homeOdds: 3.4,
        drawOdds: 3.6,
        awayOdds: 1.9,
        goalLine: '-1',
        updateTime: '2099-01-01T01:00:00+08:00',
      },
    ],
    matchPoolList: [],
  };
}

describe('lotteryStore odds parsing', () => {
  afterEach(async () => {
    await db.delete(lotteryOddsSnapshots).where(eq(lotteryOddsSnapshots.firoMatchId, testFiroMatchId));
    await db.delete(lotteryMatches).where(eq(lotteryMatches.firoMatchId, testFiroMatchId));
  });

  it('parses HAD and HHAD list odds into dedupable option snapshots', () => {
    const snapshots = parseMatchOddsSnapshots(
      sampleMatchItem(),
      '2099-01-01-CAN-BIH',
      new Date('2099-01-01T00:00:00Z'),
    );

    expect(snapshots).toHaveLength(6);
    expect(snapshots.filter((s) => s.poolCode === 'HAD').map((s) => s.optionCode)).toEqual(['HOME', 'DRAW', 'AWAY']);
    expect(snapshots.some((s) => s.poolCode === 'HHAD' && s.goalLine === '-1' && s.optionLabel === '让球平')).toBe(true);
  });

  it('parses history odds and keeps raw fallback rows for unstable markets', () => {
    const history: FiroOddsHistory = {
      matchId: String(testFiroMatchId),
      hadOddsList: [
        {
          homeWinOdds: 1.9,
          homeWinFlag: 0,
          drawOdds: 3.1,
          drawFlag: 0,
          awayWinOdds: 4.0,
          awayWinFlag: 0,
          updateDate: '2099-01-01',
          updateTime: '01:30',
        },
      ],
      hhadOddsList: [
        {
          homeWinOdds: 3.5,
          homeWinFlag: 0,
          drawOdds: 3.4,
          drawFlag: 0,
          awayWinOdds: 1.8,
          awayWinFlag: 0,
          goalLine: '-1',
          updateDate: '2099-01-01',
          updateTime: '01:30',
        },
      ],
      ttgOddsList: [{ s3Odds: 3.3, updateDate: '2099-01-01', updateTime: '01:35' }],
      crsOddsList: [{ score: '2:1', optionLabel: '2:1', updateDate: '2099-01-01', updateTime: '01:35' }],
    };

    const snapshots = parseOddsHistorySnapshots(
      testFiroMatchId,
      '2099-01-01-CAN-BIH',
      history,
      new Date('2099-01-01T00:00:00Z'),
    );

    expect(snapshots.filter((s) => s.poolCode === 'HAD')).toHaveLength(3);
    expect(snapshots.filter((s) => s.poolCode === 'HHAD')).toHaveLength(3);
    expect(snapshots.some((s) => s.poolCode === 'TTG' && s.optionCode === 's3' && s.odds === 3.3)).toBe(true);
    expect(snapshots.some((s) => s.poolCode === 'CRS' && s.source === 'firo:raw' && s.odds === 0)).toBe(true);
  });

  it('does not duplicate snapshots when the same Firo match is upserted again', async () => {
    const item = sampleMatchItem();

    await upsertLotteryMatch(item, null);
    await upsertLotteryMatch(item, null);

    const rows = await db
      .select()
      .from(lotteryOddsSnapshots)
      .where(eq(lotteryOddsSnapshots.firoMatchId, testFiroMatchId));
    expect(rows).toHaveLength(6);
  });

  it('keeps finished soccer-events visible in the lottery list with reconstructed odds', async () => {
    await upsertLotteryMatch(sampleMatchItem(), null);
    await upsertLotteryEvent({
      idEvent: 'fixture-1',
      idLeague: 'wc',
      strLeague: 'World Cup',
      strSeason: '2099',
      idHomeTeam: '1',
      strHomeTeam: 'Canada',
      idAwayTeam: '2',
      strAwayTeam: 'Bosnia',
      strCountry: '',
      intHomeScore: '2',
      intAwayScore: '0',
      intRound: null,
      strStatus: 'FT',
      strPostponed: null,
      strLocked: null,
      dateEventLocalBj: '2099-01-01',
      strTimeLocalBj: '03:00',
      homeStrTeamZh: '加拿大',
      homeStrBadgeUrl: '',
      awayStrTeamZh: '波黑',
      awayStrBadgeUrl: '',
      finishLeagueZh: '世界杯',
      shortLeagueZh: '世界杯',
      strCountryZh: '',
      badgeUrl: '',
      isJc: 1,
      matchId: testFiroMatchId,
    } satisfies FiroSoccerEvent, null);

    const stored = await listStoredLotteryMatches('2099-01-01');
    const match = stored.find((m) => m.matchMain.matchId === testFiroMatchId);

    expect(match?.matchMain.matchStatus).toBe('FT');
    expect((match?.matchMain as any).homeScore).toBe(2);
    expect((match?.matchMain as any).awayScore).toBe(0);
    expect(match?.matchOddsList).toHaveLength(2);
  });
});
