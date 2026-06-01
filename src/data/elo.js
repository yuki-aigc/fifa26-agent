/* ===========================================================
   客户端 Elo 引擎 (用于赛程列表的即时概率条)
   与后端 server/src/domain/elo.ts 同款算法,作用于球队对象。
   单场详情页的预测改为直接调用后端 /prediction 接口。
   =========================================================== */
const formScore = (form = []) => form.reduce((s, r) => s + (r === 'W' ? 2 : r === 'D' ? 1 : 0), 0);

/** 胜/平/负 概率 (整数, 和为 100) — A=主队, B=客队. */
export function odds(A, B) {
  const sA = A.ovr + (A.att - B.def) * 0.12 + (formScore(A.form) - 5) * 0.5;
  const sB = B.ovr + (B.att - A.def) * 0.12 + (formScore(B.form) - 5) * 0.5;
  const exp = 1 / (1 + Math.pow(10, (sB - sA) / 11));
  let drawP = 0.3 - 0.42 * Math.abs(exp - 0.5);
  drawP = Math.max(0.12, Math.min(0.31, drawP));
  const win = (1 - drawP) * exp;
  let w = Math.round(win * 100);
  let d = Math.round(drawP * 100);
  let l = 100 - w - d;
  if (l < 0) {
    d += l;
    l = 0;
  }
  return { win: w, draw: d, loss: l };
}
