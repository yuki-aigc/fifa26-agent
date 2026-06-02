/* ===========================================================
   中文提示词构建 · 把球队/球员数据 + Elo 先验喂给 LLM
   =========================================================== */
import type { Team, Player, Odds, ScorePrediction, Factor, H2H } from '../domain/types.js';
import type { TeamRecord } from '../services/standings.js';
import type { StatAverages } from '../services/stats.js';

export const SYSTEM_PROMPT = `你是一名专业的足球数据分析师,负责预测 FIFA26(2026 年世界杯)比赛。
你会收到双方球队的实力数据、核心球员、近期状态,以及一个基线统计模型(Elo)给出的胜平负概率作为参考先验。
请综合这些信息做出你自己的专业判断:可以认同或修正基线概率,但要给出有依据的分析。
务必通过 submit_prediction 工具返回结构化结果,其中 win+draw+loss 三者之和必须等于 100。
所有文本用简体中文。`;

function fmtPlayers(players: Player[]): string {
  return players
    .slice(0, 5)
    .map(
      (p) =>
        `  - ${p.name}(${p.pos},综合${p.ovr}): 速度${p.pace}/射门${p.shooting}/传球${p.passing}/防守${p.defending}/体能${p.stamina}`,
    )
    .join('\n');
}

/** 赛事内战绩一行 (无场次时返回空串, 由调用方决定是否拼接)。 */
function fmtRecord(rec?: TeamRecord): string {
  if (!rec || rec.played === 0) return '';
  return `本届${rec.played}场 ${rec.win}胜${rec.draw}平${rec.loss}负, 进${rec.gf}失${rec.ga}(净${rec.gd >= 0 ? '+' : ''}${rec.gd}), 积${rec.points}分`;
}

/** 场均真实表现一行 (无统计数据时返回空串)。 */
function fmtStats(s?: StatAverages): string {
  if (!s || s.matches === 0) return '';
  const parts: string[] = [];
  if (s.possession != null) parts.push(`控球${s.possession}%`);
  if (s.shots != null) parts.push(`射门${s.shots}`);
  if (s.shotsOnTarget != null) parts.push(`射正${s.shotsOnTarget}`);
  if (s.xg != null) parts.push(`xG${s.xg}`);
  return parts.length ? `场均(${s.matches}场): ${parts.join(' / ')}` : '';
}

/** 把一支队的可选真实表现块拼成缩进文本 (无数据则空)。 */
function perfBlock(rec?: TeamRecord, stats?: StatAverages): string {
  const lines = [fmtRecord(rec), fmtStats(stats)].filter(Boolean).map((l) => `  ${l}`);
  return lines.length ? '\n' + lines.join('\n') : '';
}

export function buildUserPrompt(args: {
  home: Team;
  away: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  stage: string;
  baseline: { odds: Odds; score: ScorePrediction; factors: Factor[]; h2h: H2H };
  homeRecord?: TeamRecord;
  awayRecord?: TeamRecord;
  homeStats?: StatAverages;
  awayStats?: StatAverages;
  oddsLine?: string; // 市场赔率隐含概率 (有则作为强先验)
}): string {
  const { home, away, homePlayers, awayPlayers, stage, baseline } = args;
  const factorLines = baseline.factors.map((f) => `  - ${f.label}: ${home.name} ${f.a} vs ${away.name} ${f.b}`).join('\n');
  const oddsBlock = args.oddsLine ? `\n\n【市场赔率隐含概率】\n  ${args.oddsLine}` : '';

  return `比赛: ${home.name}(主) vs ${away.name}(客)
阶段: ${stage}

【${home.name}】世界排名#${home.rank} 综合${home.ovr}(攻${home.att}/中${home.mid}/防${home.def}) 近期${home.form.join('')}${perfBlock(args.homeRecord, args.homeStats)}
核心球员:
${fmtPlayers(homePlayers) || '  - (无详细名单)'}

【${away.name}】世界排名#${away.rank} 综合${away.ovr}(攻${away.att}/中${away.mid}/防${away.def}) 近期${away.form.join('')}${perfBlock(args.awayRecord, args.awayStats)}
核心球员:
${fmtPlayers(awayPlayers) || '  - (无详细名单)'}

【实力对比】
${factorLines}

【基线模型(Elo)参考先验】
  胜平负: ${home.name}胜 ${baseline.odds.win}% / 平 ${baseline.odds.draw}% / ${away.name}胜 ${baseline.odds.loss}%
  预测比分: ${baseline.score.a}-${baseline.score.b} (预期进球 ${baseline.score.xgA}-${baseline.score.xgB})
  历史交锋: ${home.name} ${baseline.h2h.aw}胜 ${baseline.h2h.dr}平 ${baseline.h2h.bw}负(${away.name}视角相反)${oddsBlock}

请基于以上信息,通过 submit_prediction 工具给出你的预测。`;
}
