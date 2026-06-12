import { describe, expect, it } from 'vitest';
import { gradeLotteryPick } from './lotteryAccuracy.js';
import type { LotteryPickRow, MatchRow } from '../db/schema.js';

const match = {
  homeScore: 2,
  awayScore: 1,
} as MatchRow;

function pick(poolCode: string, optionCode: string, optionLabel: string, raw: unknown = {}): LotteryPickRow {
  return {
    poolCode,
    optionCode,
    optionLabel,
    raw,
    odds: 2,
  } as LotteryPickRow;
}

describe('gradeLotteryPick', () => {
  it('grades HAD outcome picks from final score', () => {
    expect(gradeLotteryPick(match, pick('HAD', 'HOME', '主胜'))).toBe(true);
    expect(gradeLotteryPick(match, pick('HAD', 'DRAW', '平'))).toBe(false);
  });

  it('grades HHAD with the stored goal line', () => {
    expect(gradeLotteryPick(match, pick('HHAD', 'DRAW', '让球平', { goalLine: '-1' }))).toBe(true);
    expect(gradeLotteryPick(match, pick('HHAD', 'HOME', '让球主胜', { goalLine: '-1' }))).toBe(false);
    expect(gradeLotteryPick(match, pick('HHAD', 'HOME', '让球主胜'))).toBeNull();
  });

  it('grades TTG and CRS when option parsing is stable', () => {
    expect(gradeLotteryPick(match, pick('TTG', '3', '总进球3'))).toBe(true);
    expect(gradeLotteryPick(match, pick('TTG', '2-3球', '2-3球'))).toBe(true);
    expect(gradeLotteryPick(match, pick('TTG', '4', '总进球4'))).toBe(false);
    expect(gradeLotteryPick(match, pick('CRS', '2:1', '2:1'))).toBe(true);
    expect(gradeLotteryPick(match, pick('CRS', '1:1', '1:1'))).toBe(false);
  });

  it('leaves HAFU ungraded without half-time score data', () => {
    expect(gradeLotteryPick(match, pick('HAFU', 'HH', '胜胜'))).toBeNull();
  });
});
