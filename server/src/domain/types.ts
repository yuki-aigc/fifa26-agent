import type { TeamRow, PlayerRow, MatchRow } from '../db/schema.js';

export type Team = TeamRow;
export type Player = PlayerRow;
export type Match = MatchRow;

/** 五维雷达 (zh keys, matching the iOS/web radar axes). */
export interface Radar {
  速度: number;
  射门: number;
  传球: number;
  防守: number;
  体能: number;
}

export function toRadar(p: Pick<Player, 'pace' | 'shooting' | 'passing' | 'defending' | 'stamina'>): Radar {
  return { 速度: p.pace, 射门: p.shooting, 传球: p.passing, 防守: p.defending, 体能: p.stamina };
}

/** 胜/平/负 概率 (整数百分比, 和为 100). */
export interface Odds {
  win: number;
  draw: number;
  loss: number;
}

export interface ScorePrediction {
  a: number;
  b: number;
  xgA: string;
  xgB: string;
}

export interface H2H {
  total: number;
  aw: number;
  dr: number;
  bw: number;
}

export interface Factor {
  label: string;
  a: string;
  b: string;
  lead: -1 | 0 | 1;
  pa: number;
  pb: number;
}

/** Unified prediction payload returned by both the Elo engine and the AI predictor. */
export interface Prediction {
  engine: 'elo' | 'ai';
  provider?: string;
  model?: string;
  win: number;
  draw: number;
  loss: number;
  predScoreHome: number;
  predScoreAway: number;
  confidence: number;
  keyFactors: string[];
  reasoning: string;
}
