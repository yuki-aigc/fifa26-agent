/* ===========================================================
   结构化预测工具 (TypeBox schema)
   通过工具调用让 LLM 返回受约束的预测结果。
   =========================================================== */
import { Type, type Static } from '@earendil-works/pi-ai';

export const PredictMatchSchema = Type.Object({
  win: Type.Integer({ minimum: 0, maximum: 100, description: '主队取胜概率(百分比)' }),
  draw: Type.Integer({ minimum: 0, maximum: 100, description: '平局概率(百分比)' }),
  loss: Type.Integer({ minimum: 0, maximum: 100, description: '客队取胜概率(百分比)' }),
  predScoreHome: Type.Integer({ minimum: 0, maximum: 9, description: '主队预测进球数' }),
  predScoreAway: Type.Integer({ minimum: 0, maximum: 9, description: '客队预测进球数' }),
  confidence: Type.Integer({ minimum: 0, maximum: 100, description: '模型置信度(百分比)' }),
  keyFactors: Type.Array(Type.String(), { description: '3-5 条决定比赛走向的关键因素(中文短句)', minItems: 1 }),
  reasoning: Type.String({ description: '一段中文分析,解释预测依据' }),
});

export type PredictMatchArgs = Static<typeof PredictMatchSchema>;

export const predictMatchTool = {
  name: 'submit_prediction',
  description: '提交对这场 FIFA26 比赛的结构化预测。win+draw+loss 必须合计为 100。',
  parameters: PredictMatchSchema,
};
