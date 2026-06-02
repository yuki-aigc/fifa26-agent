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
    expect(parsed?.recommendation).toBe('主胜优先');
    expect(parsed?.confidence).toBe(88);
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
