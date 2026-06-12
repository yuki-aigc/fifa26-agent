import { describe, expect, it } from 'vitest';
import { parseLotteryAnalysisToolCall } from './lotteryAnalysis.js';

describe('parseLotteryAnalysisToolCall', () => {
  it('returns structured analysis from the expected tool call', () => {
    const parsed = parseLotteryAnalysisToolCall(
      [
        { type: 'text', name: 'ignored' },
        {
          type: 'toolCall',
          name: 'submit_lottery_analysis',
          arguments: {
            suggestions: ['胜平负: 主胜', '让球: 主让胜', '总进球: 2-3球', '比分: 2:1', '半全场: 胜胜', '忽略第6条'],
            recommendation: '主胜优先',
            confidence: 87.6,
            reasoning: '主队状态和赔率走势更优。',
          },
        },
      ],
      1001,
    );

    expect(parsed?.matchId).toBe(1001);
    expect(parsed?.suggestions).toHaveLength(5);
    expect(parsed?.picks).toEqual([]);
    expect(parsed?.recommendation).toBe('主胜优先');
    expect(parsed?.confidence).toBe(88);
  });

  it('parses structured picks and derives legacy suggestions when needed', () => {
    const parsed = parseLotteryAnalysisToolCall(
      [
        {
          type: 'toolCall',
          name: 'submit_lottery_analysis',
          arguments: {
            recommendation: '稳健走主胜，博胆比分2:1',
            confidence: '72',
            reasoning: '赔率和近期状态支持主队方向。',
            picks: [
              {
                tier: '稳健',
                poolCode: 'HAD',
                optionCode: 'HOME',
                optionLabel: '主胜',
                odds: '1.86',
                modelProbability: null,
                ev: null,
                stakeFraction: null,
                reason: '主队让步稳定。',
              },
              {
                tier: '博胆',
                poolCode: 'CRS',
                optionCode: '2:1',
                optionLabel: '2:1',
                reason: '双方都有进球能力。',
              },
            ],
          },
        },
      ],
      1004,
    );

    expect(parsed?.suggestions).toEqual(['HAD: 主胜', 'CRS: 2:1']);
    expect(parsed?.picks).toHaveLength(2);
    expect(parsed?.picks?.[0]).toMatchObject({
      tier: '稳健',
      poolCode: 'HAD',
      optionCode: 'HOME',
      optionLabel: '主胜',
      odds: 1.86,
      modelProbability: null,
      ev: null,
      stakeFraction: null,
    });
  });

  it('clamps invalid confidence and fills missing optional values safely', () => {
    const parsed = parseLotteryAnalysisToolCall(
      [
        {
          type: 'toolCall',
          name: 'submit_lottery_analysis',
          arguments: { confidence: 120 },
        },
      ],
      1002,
    );

    expect(parsed?.suggestions).toEqual([]);
    expect(parsed?.confidence).toBe(100);
    expect(parsed?.reasoning).toBe('');
  });

  it('returns null when the model does not call the required tool', () => {
    expect(parseLotteryAnalysisToolCall([{ type: 'text' }], 1003)).toBeNull();
  });
});
