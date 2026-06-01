/* ===========================================================
   胜率引擎 · Elo 逻辑模型
   由 frontend src/data/wc.js 移植, 改为基于 DB Team 记录运算。
   =========================================================== */
import type { Team, Odds, ScorePrediction, H2H, Factor } from './types.js';

const formScore = (form: string[]): number =>
  form.reduce((s, r) => s + (r === 'W' ? 2 : r === 'D' ? 1 : 0), 0); // 0-10

/** 胜/平/负 概率 (整数, 和为 100) — A=主队, B=客队. */
export function odds(A: Team, B: Team): Odds {
  const sA = A.ovr + (A.att - B.def) * 0.12 + (formScore(A.form) - 5) * 0.5;
  const sB = B.ovr + (B.att - A.def) * 0.12 + (formScore(B.form) - 5) * 0.5;
  const exp = 1 / (1 + Math.pow(10, (sB - sA) / 11)); // A 的净胜望

  let drawP = 0.30 - 0.42 * Math.abs(exp - 0.5);
  drawP = Math.max(0.12, Math.min(0.31, drawP));
  const rem = 1 - drawP;
  const win = rem * exp;

  let w = Math.round(win * 100);
  let d = Math.round(drawP * 100);
  let l = 100 - w - d;
  if (l < 0) {
    d += l;
    l = 0;
  }
  return { win: w, draw: d, loss: l };
}

/** 预测比分 + 预期进球. */
export function score(A: Team, B: Team): ScorePrediction {
  const xg = (att: number, def: number) => 0.55 + ((att + (100 - def)) / 100) * 1.55;
  const gA = xg(A.att, B.def);
  const gB = xg(B.att, A.def);
  let rA = Math.round(gA);
  let rB = Math.round(gB);
  const o = odds(A, B);
  if (o.win > o.loss && rA <= rB) rA = rB + 1;
  if (o.loss > o.win && rB <= rA) rB = rA + 1;
  if (o.win === o.loss && rA !== rB) rB = rA;
  return { a: rA, b: rB, xgA: gA.toFixed(1), xgB: gB.toFixed(1) };
}

/** 历史交锋 (由队代码确定性生成). */
export function h2h(A: Team, B: Team): H2H {
  let seed = (A.code + B.code).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const total = 5 + Math.floor(rnd() * 6);
  let aw = 0;
  let dr = 0;
  let bw = 0;
  const bias = (A.ovr - B.ovr) / 30;
  for (let i = 0; i < total; i++) {
    const r = rnd() + bias;
    if (r > 0.62) aw++;
    else if (r < 0.34) bw++;
    else dr++;
  }
  return { total, aw, dr, bw };
}

/** 关键因素对比 (用于详情页 + 作为 AI 先验). */
export function factors(A: Team, B: Team): Factor[] {
  const f: Factor[] = [];
  const cmp = (label: string, va: number, vb: number, unit = '') =>
    f.push({
      label,
      a: va + unit,
      b: vb + unit,
      lead: va === vb ? 0 : va > vb ? 1 : -1,
      pa: va,
      pb: vb,
    });
  cmp('综合实力', A.ovr, B.ovr);
  cmp('进攻', A.att, B.att);
  cmp('中场', A.mid, B.mid);
  cmp('防守', A.def, B.def);
  cmp('近期状态', formScore(A.form), formScore(B.form), '/10');
  f.push({
    label: '世界排名',
    a: '#' + A.rank,
    b: '#' + B.rank,
    lead: A.rank === B.rank ? 0 : A.rank < B.rank ? 1 : -1,
    pa: 100 - A.rank,
    pb: 100 - B.rank,
  });
  return f;
}
