import { describe, expect, it } from 'vitest';
import {
  buildFiroNameToCode,
  findFiroWorldCupMatch,
  normFiroTeamName,
  type FiroWorldCupContext,
} from './firoWorldCup.js';

describe('firoWorldCup matching', () => {
  it('maps Firo aliases and matches local World Cup fixtures', () => {
    const nameToCode = buildFiroNameToCode([
      { code: 'CAN', name: 'Canada', en: 'Canada' },
      { code: 'BIH', name: '波黑', en: 'Bosnia & Herzegovina' },
    ] as any);
    const context: FiroWorldCupContext = {
      nameToCode,
      matchRows: [
        {
          id: '2026-06-12-CAN-BIH',
          homeCode: 'CAN',
          awayCode: 'BIH',
          kickoff: new Date('2026-06-12T19:00:00Z'),
        } as any,
      ],
    };

    expect(nameToCode.get(normFiroTeamName('加拿大'))).toBe('CAN');
    expect(nameToCode.get(normFiroTeamName('波斯尼亚和黑塞哥维那'))).toBe('BIH');

    const hit = findFiroWorldCupMatch({
      homeName: '波斯尼亚和黑塞哥维那',
      awayName: '加拿大',
      kickoff: new Date('2026-06-12T19:00:00Z'),
      context,
    });

    expect(hit?.match.id).toBe('2026-06-12-CAN-BIH');
    expect(hit?.reversed).toBe(true);
  });
});
