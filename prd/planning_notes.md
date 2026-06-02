---
name: fifa26-agent-research-notes
description: FIFA26-Agent 代码现状调研笔记（用于生成功能规划文档）
metadata:
  type: project
---

# Research Notes: FIFA26-Agent 现状调研

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React + Vite, H5 animal-island-ui 风格 |
| 后端 | Fastify + Drizzle ORM + SQLite |
| AI | @earendil-works/pi-ai，接入 Kimi(kimi-k2.6) via Moonshot |
| 数据源 | OpenFootball(FIFA赛事) + Firo API(竞彩) |
| 启动 | concurrently 同时启动前后端 (pnpm dev) |

## 已实现模块

### 后端 (server/)

#### 数据入库
- `ingest/seed.ts` — OpenFootball FIFA赛程种子数据
- `ingest/sources/firoApi.ts` — Firo API 集成 (RSA-SHA256签名)
  - `fetchLotteryList()` — 当日竞彩赛程+实时赔率
  - `fetchLotteryAllList(date?)` — 按日期全量赛程
  - `fetchLotteryOdds(matchId)` — 单场赔率历史(HAD+HHAD)
  - `fetchFootballInfo(matchId)` — 综合情报(H2H+伤停+近期状态)
  - `fetchSoccerEvents(date?, isJc?)` — TheSportsDB同步赛程
- `ingest/sources/apiFootball.ts` — API-Football 数据源
- `ingest/sources/openfootball.ts` — OpenFootball 静态数据
- `ingest/scheduler.ts` — 定时同步
- `ingest/h2h.ts` — H2H数据处理
- `ingest/firoSync.ts` — Firo同步

#### AI 预测 (ai/)
- `pi.ts` — LLM提供方配置 (Kimi gateway)
- `predictor.ts` — FIFA比赛 AI 预测 (Elo基线 + AI增强)
- `prompt.ts` + `predictTool.ts` — 提示词和工具定义

#### 业务服务 (services/)
- `teams.ts` — 球队列表/详情
- `players.ts` — 球员列表/详情
- `matches.ts` — 比赛列表/详情/视图
- `predictions.ts` — 预测结果(Elo + AI选择)
- `accuracy.ts` — 预测对账/准确率统计
- `h2h.ts` — 历史交锋
- `injuries.ts` — 伤停名单
- `standings.ts` — 积分榜
- `stats.ts` — 统计数据
- `odds.ts` — 赔率
- `lotteryAnalysis.ts` — 竞彩AI分析 (Kimi工具调用)

#### 路由 (routes/index.ts)
- `GET /health` — 健康检查+AI配置状态
- `GET /api/teams` — 球队列表
- `GET /api/teams/:code` — 球队详情
- `GET /api/players` — 球员列表(支持 position 过滤)
- `GET /api/players/:id` — 球员详情
- `GET /api/matches` — 比赛列表(支持 status/group 过滤)
- `GET /api/matches/:id` — 比赛详情
- `GET /api/matches/:id/prediction?ai=1` — 比赛AI预测
- `GET /api/accuracy` — 预测准确率
- `GET /api/lottery/matches` — 竞彩赛程列表
- `GET /api/lottery/matches/:id` — 单场情报(H2H+赔率历史)
- `GET /api/lottery/matches/:id/analysis` — 竞彩AI分析

### 前端 (src/)

#### 竞彩模块 (LotteryScreens.jsx) ✅ 新增
- `LotteryScreen` — 列表: 实时赔率卡片(HAD/HHAD)+玩法状态芯片
- `LotteryDetailScreen` — 详情:
  - 对阵头部卡(徽章+名称)
  - 实时赔率(HAD/HHAD tab切换,大字号)
  - 玩法开售状态芯片(5种)
  - 赔率走势表(最新6条,↑↓箭头)
  - 历史交锋(胜平负+彩色进度条)
  - 主客场特征(mini条形图)
  - 近期状态+逐场战绩
  - 伤停名单
  - AI竞彩分析卡(按需触发)

#### FIFA模块 (Screens.jsx) ✅ 已有
- `MatchesScreen` — FIFA赛程列表
- `MatchDetailScreen` — 比赛详情+AI预测+H2H
- `TeamsScreen` — 球队列表+雷达图
- `TeamDetailScreen` — 球队详情
- `PlayersScreen` — 球员列表
- `PlayerDetailScreen` — 球员详情+五维雷达

#### App 框架 (App.jsx)
- 导航栈: push/back 模式
- 4个Tab: 竞彩🎲 / 赛程⚽ / 球队🛡️ / 球员👤
- 竞彩Tab独立于DataProvider(不依赖FIFA数据加载)

## 数据类型未完全实现
- `FiroOddsHistory.hafuOddsList` — 半全场赔率历史 (类型为unknown[])
- `FiroOddsHistory.ttgOddsList` — 总进球赔率历史 (类型为unknown[])
- `FiroOddsHistory.crsOddsList` — 比分赔率历史 (类型为unknown[])
- `FiroPlayer` 类型已定义但前端未展示球员出场统计

## 潜在问题
- Firo 徽章 URL 有时失效 (onError 回退已处理)
- AI分析每次调用都重新请求 (无缓存)
- 竞彩只展示当日赛程，无历史查询
- 赔率数据无实时刷新 (需手动返回再进)
