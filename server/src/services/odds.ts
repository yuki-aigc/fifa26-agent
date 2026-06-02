/* ===========================================================
   市场赔率 (odds) · 读取最新盘口 + 隐含概率
   写入由 sync 完成 (来源 API-Football /odds, 时间序列追加)。
   隐含概率 = 1/赔率 归一去水 (overround), 作为 AI 强先验。
   =========================================================== */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { odds as oddsTable } from '../db/schema.js';
import type { OddsRow } from '../db/schema.js';

export interface OddsView {
  bookmaker: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  capturedAt: Date;
  implied: { win: number; draw: number; loss: number }; // 去水后整数百分比, 和≈100
}

/** 1X2 十进制赔率 → 去水隐含概率 (整数百分比, 合计 100)。 */
export function impliedProbs(homeWin: number, draw: number, awayWin: number) {
  const rw = homeWin > 0 ? 1 / homeWin : 0;
  const rd = draw > 0 ? 1 / draw : 0;
  const rl = awayWin > 0 ? 1 / awayWin : 0;
  const sum = rw + rd + rl || 1;
  let win = Math.round((rw / sum) * 100);
  let drawP = Math.round((rd / sum) * 100);
  let loss = 100 - win - drawP;
  if (loss < 0) {
    drawP += loss;
    loss = 0;
  }
  return { win, draw: drawP, loss };
}

function toView(r: OddsRow): OddsView {
  return {
    bookmaker: r.bookmaker,
    homeWin: r.homeWin,
    draw: r.draw,
    awayWin: r.awayWin,
    capturedAt: r.capturedAt,
    implied: impliedProbs(r.homeWin, r.draw, r.awayWin),
  };
}

/** 某场最新一条赔率 (按抓取时间倒序), 无则 null。 */
export async function getLatestOdds(matchId: string): Promise<OddsView | null> {
  const rows = await db
    .select()
    .from(oddsTable)
    .where(eq(oddsTable.matchId, matchId))
    .orderBy(desc(oddsTable.capturedAt))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

/** 给 AI 提示词用的赔率隐含概率一行 + 结构化 view。无赔率返回 null。 */
export async function latestOddsLine(
  matchId: string,
  homeName: string,
  awayName: string,
): Promise<{ odds: OddsView; text: string } | null> {
  const v = await getLatestOdds(matchId);
  if (!v) return null;
  const text = `${homeName}胜 ${v.implied.win}% / 平 ${v.implied.draw}% / ${awayName}胜 ${v.implied.loss}% (${v.bookmaker || '盘口'}: ${v.homeWin}/${v.draw}/${v.awayWin})`;
  return { odds: v, text };
}
