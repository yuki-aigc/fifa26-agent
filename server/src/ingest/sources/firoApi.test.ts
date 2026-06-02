import { describe, expect, it } from 'vitest';
import { buildFiroSignString } from './firoApi.js';

describe('buildFiroSignString', () => {
  it('builds the base string without optional params', () => {
    expect(buildFiroSignString('key-1', '1717300000000')).toBe(
      'apiKey=key-1&timestamp=1717300000000',
    );
  });

  it('sorts signed params by key name', () => {
    expect(buildFiroSignString('key-1', '1717300000000', { matchId: 42, date: '2026-06-08' })).toBe(
      'apiKey=key-1&timestamp=1717300000000&date=2026-06-08&matchId=42',
    );
  });
});
