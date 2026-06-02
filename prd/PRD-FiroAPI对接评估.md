# PRD · FiroAPI 对接评估与接入方案

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 编写日期 | 2026-06-02 |
| 关联项目 | `FIFA26-Agent` |
| 文档定位 | 第三方数据源接入评估 + 后端实施方案 |
| 参考文档 | https://www.firoapi.com/api-docs 、https://www.firoapi.com/request-examples |
| 当前代码状态 | 已有 `server/src/ingest/sources/firoApi.ts`，已暴露 `/api/lottery/matches` 与 `/api/lottery/matches/:id`；尚未落库、尚未进入前端主链路 |

---

## 0. 最新数据源反馈（2026-06-02）

商家反馈：

- 竞足数据预计 **2026-06-08** 更新世界杯赛程。
- `/firo/tsd/soccer-events` 预计 **2026-06-03 至 2026-06-04** 更新，届时可查询未来 30 天比赛，世界杯比赛也覆盖在内。

因此当前接入策略调整为：

1. **6.8 前不要把 `/firo/sports-lottery/list` 或 `/all-list` 未返回世界杯视为异常**，这是数据上架时间未到。
2. **优先用 `/firo/tsd/soccer-events` 做未来 30 天世界杯赛程覆盖检测和本项目赛程映射**。
3. 当 `soccer-events` 返回 `isJc=1` 且带 `matchId` 时，再调用 `/firo/sports-lottery/odds` 获取 HAD/HHAD/TTG/CRS 等赔率历史。
4. 6.8 后再把 `/firo/sports-lottery/all-list` 作为竞足赔率快照主同步源。

---

## 1. 背景与目标

当前系统的数据链路以 OpenFootball 种子数据、API-Football 实时赛果/统计/赔率、Elo 基线和 AI 增强预测为核心。FiroAPI 的价值在于补充一套更贴近中文用户和竞彩场景的数据源，尤其是：

- 竞彩足球赛程、销售状态、玩法开售状态。
- HAD/HHAD/HAFU/TTG/CRS 等全玩法赔率及赔率波动历史。
- 单场综合情报：历史交锋、主客场特征、伤停、球员出场/进球/助攻、近期战绩、积分榜、未来赛程。
- TheSportsDB 同步的足球按日赛程，含中文队名、中文联赛名、队徽、是否竞彩、竞彩 `matchId`。

本 PRD 的目标不是引入投注功能，而是评估哪些数据可以提升 FIFA26 预测系统的数据丰富度、AI 解释质量和中文化展示能力。

---

## 2. 认证与调用约束

FiroAPI 使用三请求头认证：

| 请求头 | 说明 |
| --- | --- |
| `X-API-Key` | API key |
| `X-Timestamp` | 当前毫秒时间戳 |
| `X-Signature` | RSA-SHA256 签名后的 Base64 字符串 |

签名规则：

- 私钥格式：PKCS#8 DER 的 Base64 编码。
- 签名算法：RSA-SHA256。
- 待签名字符串：`apiKey={apiKey}&timestamp={timestamp}`，有参与签名的参数时追加 `&{按键名排序的参数}`。
- 时间戳有效期：文档标注为 5 分钟。

当前代码里的 `firoGet` 已基本符合该规则：

- 配置项：`FIRO_API_KEY`、`FIRO_PRIVATE_KEY`。
- Base URL：`https://www.firoapi.com`。
- 私钥解析：`createPrivateKey({ format: 'der', type: 'pkcs8' })`。
- 签名：`createSign('SHA256').update(str).sign(privateKey, 'base64')`。

需要注意：文档里的“必填”列对部分参数显示为空，但说明写着“不能为空”。实现时应按说明处理，例如 `/firo/sports-lottery/odds` 和 `/firo/sports-lottery/football-info` 的 `matchId` 应视为必填。

---

## 3. 接口清单与项目价值评估

### 3.1 竞彩足球赛程信息

| 项 | 内容 |
| --- | --- |
| 接口 | `GET /firo/sports-lottery/list` |
| 参数 | 无 |
| 说明 | 查询竞足赛程信息，偏“未开赛比赛列表”，含实时赔率数据 |
| 当前代码 | 已实现 `fetchLotteryList()` |

核心返回：

- `matchMain`：`matchId`、`matchNumStr`、销售日期、实际比赛日期、比赛时间、联赛、主客队名称/队徽、赛事状态、销售状态、星期、更新时间。
- `matchOddsList`：`poolCode`、`homeOdds`、`drawOdds`、`awayOdds`、`goalLine`、`updateTime`。
- `matchPoolList`：玩法状态、是否支持单关/串关。

项目价值：高。

- 可作为赛前赔率快照来源，补强 AI 的市场先验。
- 可为前端增加“市场参考”卡片：胜平负赔率、让球数、玩法状态。
- 可用 `matchId` 作为 Firo 单场情报接口的入口。

局限：

- 该接口面向竞彩场次，不保证覆盖 FIFA26 全部比赛。
- 队名为中文/赛事方命名，需要和本项目 `teams` / `matches` 做映射。

### 3.2 竞彩足球赛程列表

| 项 | 内容 |
| --- | --- |
| 接口 | `GET /firo/sports-lottery/all-list` |
| 参数 | `date`，格式 `yyyy-MM-dd` |
| 说明 | 查询竞足全部赛事信息，支持按日期查询，含实时赔率数据 |
| 当前代码 | 尚未实现 |

返回结构与 `/list` 基本一致。

项目价值：高。

- 比 `/list` 更适合做同步任务：按日期拉取、幂等落库、回溯补数据。
- 可作为“比赛日”维度的 Firo 数据源，不依赖当前销售列表范围。

建议优先级：P1。当前已有 `/list`，下一步应补 `fetchLotteryAllList(date)`，用于定时同步。

### 3.3 单场赔率历史

| 项 | 内容 |
| --- | --- |
| 接口 | `GET /firo/sports-lottery/odds` |
| 参数 | `matchId` |
| 说明 | 根据赛事 ID 查询最新赔率与赔率波动历史，覆盖 HAD、HHAD、HAFU、TTG、CRS |
| 当前代码 | 已实现 `fetchLotteryOdds(matchId)`，但类型只覆盖 HAD/HHAD |

核心返回：

- `hadOddsList`：胜平负赔率历史。
- `hhadOddsList`：让球胜平负赔率历史。
- `hafuOddsList`：半全场赔率历史。
- `ttgOddsList`：总进球数赔率历史。
- `crsOddsList`：比分赔率历史。
- `*Flag`：赔率变化标识，文档示例中 `-1/0/1` 表示降/平/升。

项目价值：最高。

- HAD 可转为去水后的胜/平/负隐含概率，直接喂给 AI。
- HHAD 可反映盘口倾向，辅助判断强弱差距是否被市场充分计价。
- TTG 可辅助预测总进球倾向，校正 Elo 的预期进球。
- CRS 可辅助精确比分预测，适合和当前 `predScoreHome/predScoreAway` 对比。
- 历史序列可以提取赔率漂移特征，例如主胜赔率持续下调、平局赔率上调。

建议优先级：P0。已有 `odds` 表只存 1X2 快照，应扩展为 Firo 专用赔率表或附加字段，保留玩法类型和历史时间点。

### 3.4 单场足球综合信息

| 项 | 内容 |
| --- | --- |
| 接口 | `GET /firo/sports-lottery/football-info` |
| 参数 | `matchId` |
| 说明 | 查询足球赛事综合信息，含历史交锋、比赛特征、伤停、球员、近期战绩、积分榜、未来赛程 |
| 当前代码 | 已实现 `fetchFootballInfo(matchId)`，但类型未覆盖全部字段 |

核心返回：

- `history`：历史交锋汇总，含场次、胜平负、胜率、进失球、净胜球。
- `historyDetails`：交锋历史明细，含比赛日期、赛事简称、主客队、全场/半场比分、胜方。
- `feature`：主队主场、客队客场表现，场均进球/失球。
- `injuries`：伤停名单，含主客队视角、球员姓名、位置、号码、受伤/停赛。
- `players`：球员数据，含出场、首发、替补、进球、助攻、伤停状态。
- `result` / `resultDetails`：近期战绩概览与逐场明细。
- `tables`：积分榜、主场/客场排名和积分。
- `futureDetails`：未来赛程，含球队视角、比赛时间、赛事/阶段/小组/轮次。

项目价值：高，但要分场景使用。

- 对 FIFA26 国家队比赛，`history` / `historyDetails`、`injuries`、`players`、`result` 最有价值。
- `feature` 对俱乐部联赛更有用；国家队中“主场/客场”意义较弱，世界杯中还可能是中立场。
- `tables` 对联赛预测有价值；世界杯小组赛可作为参考，但与本项目自有 `standings` 派生逻辑可能重复。
- `futureDetails` 可用于体能/轮换预测，但 FIFA26 赛程本项目已有 OpenFootball 数据，应以本地赛程为准。

建议优先级：P1。先把 `injuries`、`players`、`historyDetails`、`resultDetails` 补入类型和缓存；后续再决定是否落库 `tables/futureDetails`。

### 3.5 足球按日赛程

| 项 | 内容 |
| --- | --- |
| 接口 | `GET /firo/tsd/soccer-events` |
| 参数 | `date`、`isJc` |
| 说明 | 按北京日期查询 TheSportsDB 同步的足球赛程；可筛选是否竞彩场次；商家反馈更新后可查未来 30 天并覆盖世界杯 |
| 当前代码 | 已实现 `fetchSoccerEvents(date?, isJc?)`，并已接入 `sync:firo` 作为优先扫描源 |

核心返回：

- `date`：实际查询的北京日期。
- `matches[]`：TheSportsDB 赛事 ID、联赛 ID、赛季、英文主客队、比分、状态、北京时间、中文主客队、中文联赛、队徽、是否竞彩、竞彩 `matchId`。

项目价值：高。

- 对 FIFA26 主数据不应替代 OpenFootball，因为 OpenFootball 已覆盖真实抽签和世界杯赛程。
- 但它是 6.8 前最重要的 Firo 世界杯覆盖探测源，可以提前确认中文队名、队徽、北京时间、是否竞彩、竞彩 `matchId`。
- 当 `isJc=1` 且 `matchId` 存在时，可直接作为 `/sports-lottery/odds` 与 `/football-info` 的入口。

建议优先级：P0。先用它建立世界杯赛程映射与 matchId 探测；6.8 后再切到竞足赔率快照主链路。

---

## 4. 数据对当前系统的有用程度排序

| 优先级 | 数据 | 用途 | 推荐动作 |
| --- | --- | --- | --- |
| P0 | HAD 胜平负赔率 | AI 市场先验、前端展示、预测对账对比 | 落库，转换隐含概率 |
| P0 | 赔率历史趋势 | 判断市场方向，增强 AI 解释 | 落库或缓存最近 N 条 |
| P1 | HHAD 让球赔率 | 识别强弱差距和盘口方向 | 落库玩法类型 |
| P1 | TTG 总进球赔率 | 校正预期总进球和比分预测 | 建映射函数，供 AI prompt |
| P1 | CRS 比分赔率 | 校验/辅助精确比分预测 | 先作为 AI 文本先验，后续结构化 |
| P1 | 伤停名单 | 影响球队实力与 AI 关键因素 | 映射到现有 `injuries` 表 |
| P1 | 球员出场/进球/助攻 | 核心球员状态、前端球员详情增强 | 新表或 JSON 缓存 |
| P1 | 历史交锋明细 | 补充当前 API-Football H2H | 可落入 `h2h_matches` 或独立来源表 |
| P2 | 近期战绩 | 作为当前 `form` 派生的外部校验 | 仅缓存，避免覆盖本届真实结果 |
| P2 | 积分榜 | 联赛场景有效，世界杯小组赛需谨慎 | 暂不接主链路 |
| P2 | 未来赛程 | 体能/轮换参考 | 与本地赛程比对后使用 |
| P3 | 玩法销售状态 | 产品展示用，不参与预测 | 仅在调试/市场卡片展示 |

---

## 5. 推荐数据模型调整

当前已有：

- `odds`：`matchId/bookmaker/homeWin/draw/awayWin/capturedAt`。
- `injuries`：`matchId/teamCode/playerName/reason/playerPos/updatedAt`。
- `h2h_matches`：真实交锋。

建议新增或扩展：

### 5.1 Firo 比赛映射表

`firo_matches`

| 字段 | 说明 |
| --- | --- |
| `firoMatchId` | Firo 竞彩赛事 ID，主键 |
| `matchId` | 本项目 `matches.id`，可为空 |
| `homeName` / `awayName` | Firo 原始队名 |
| `homeTeamId` / `awayTeamId` | Firo 队伍 ID |
| `leagueName` / `leagueShort` | 联赛名 |
| `matchStartDate` / `matchTime` | 实际比赛日期时间 |
| `matchNumStr` | 周几编号，例如周五001 |
| `matchStatus` / `sellStatus` | 赛事与销售状态 |
| `lastSyncedAt` | 最后同步时间 |

用途：

- 解决 Firo `matchId` 与本项目 `matches.id` 的映射。
- 避免每次预测时实时查 Firo API。

### 5.2 Firo 赔率表

`firo_odds`

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `firoMatchId` | Firo 赛事 ID |
| `matchId` | 本项目比赛 ID，可为空 |
| `poolCode` | `HAD/HHAD/HAFU/TTG/CRS` |
| `marketKey` | 市场项，例如 `homeWin/draw/awayWin/score21/threeGoals` |
| `odds` | 十进制赔率 |
| `flag` | `-1/0/1` 变化标识 |
| `goalLine` | 让球数，可为空 |
| `capturedAt` | 组合 `updateDate/updateTime` 或同步时间 |

用途：

- 统一存储全玩法赔率。
- 生成 AI prompt 的结构化市场摘要。

### 5.3 Firo 情报缓存表

`firo_match_info`

| 字段 | 说明 |
| --- | --- |
| `firoMatchId` | Firo 赛事 ID |
| `matchId` | 本项目比赛 ID，可为空 |
| `historyJson` | 历史交锋汇总/明细 |
| `featureJson` | 主客场特征 |
| `injuriesJson` | 伤停 |
| `playersJson` | 球员数据 |
| `resultJson` | 近期战绩 |
| `tablesJson` | 积分榜 |
| `futureJson` | 未来赛程 |
| `updatedAt` | 更新时间 |

用途：

- 初期降低建模复杂度，先 JSON 缓存。
- 稳定后再拆分出 `firo_players`、`firo_history_details` 等细表。

---

## 6. 预测链路接入方案

### 6.1 当前预测输入

`server/src/services/predictions.ts` 已把以下数据传给 AI：

- Elo 基线：胜平负、比分、实力因素、H2H。
- 本届战绩：`teamRecord`。
- 场均统计：`teamStatAverages`。
- 最新赔率：`latestOddsLine`。
- 伤停：`getMatchInjuries`。
- 休息天数：`getTeamRestDays`。

### 6.2 Firo 增强后的输入

建议新增 `latestFiroMarketLine(matchId)`，输出面向 prompt 的短文本，例如：

```text
Firo 市场:
- HAD 去水概率: 主胜 43% / 平 28% / 客胜 29%，主胜赔率近 24h 从 2.45 降至 2.28
- HHAD: 主队 -1，主胜 3.10 / 平 3.50 / 客胜 1.95
- TTG: 2球/3球赔率最低，市场倾向总进球 2-3
- CRS: 1-1、2-1、1-0 为低赔率比分区间
```

AI 使用原则：

- HAD 是强先验，但不能机械覆盖 Elo。
- HHAD 只作为强弱差距信号。
- TTG/CRS 主要影响比分和总进球，不直接影响胜平负。
- 若 Firo 数据与 API-Football 赔率冲突，prompt 应明确提示“多市场存在分歧”，让模型解释判断。

### 6.3 前端展示建议

短期不新增主导航，只在单场预测详情页增加一个“市场参考”区块：

- 胜平负赔率与去水概率。
- 让球胜平负摘要。
- 总进球倾向。
- 赔率更新时间。
- 明确展示“仅用于数据分析，不提供投注建议”。

---

## 7. API 设计建议

当前已有：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/lottery/matches` | 透传 Firo `/firo/sports-lottery/list` |
| `GET` | `/api/lottery/matches/:id` | 并发返回 `football-info` 与 `odds` |

建议补充：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/lottery/matches?date=YYYY-MM-DD` | 内部优先调用 `/all-list`，无 date 时调用 `/list` |
| `GET` | `/api/matches/:id/market` | 返回本项目比赛映射后的 Firo/API-Football 市场摘要 |
| `POST` | `/api/admin/sync/firo?date=YYYY-MM-DD` | 手动触发 Firo 同步，仅开发/管理使用 |
| `GET` | `/health` | 增加 `firo.keyConfigured`，不要暴露私钥或签名细节 |

---

## 8. 同步策略

推荐分三层：

1. 赛前日同步：每天拉未来 7 天 `all-list`，建立 `firo_matches` 映射。
2. 赛前高频同步：开赛前 48 小时，每 30-60 分钟拉赔率历史和综合情报。
3. 按需补抓：用户打开单场详情且无缓存时，后台补抓该场 Firo 数据。

频率建议保守处理，因为文档未在页面中明确调用额度和限速：

- 默认不开启自动 Firo 同步。
- 增加 `FIRO_SYNC_ENABLED=false`。
- 与 API-Football 调度分开，避免一个源失败影响另一个源。
- Firo 调用失败不影响 `/prediction`，只回退到现有 Elo/API-Football 数据。

---

## 9. 风险与注意事项

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| 覆盖范围不确定 | 竞彩接口不保证覆盖世界杯所有场次 | Firo 作为增强源，不作为主赛程源 |
| 队名映射 | 中文队名、简称、国家队/俱乐部混杂 | 建映射表，人工校准 FIFA26 48 队 |
| 中立场语义 | 世界杯主客队不等同主客场优势 | `feature` 的主场/客场指标在世界杯中降权 |
| 赔率合规 | 产品不能暗示投注建议 | UI 文案明确“市场参考/数据分析” |
| 签名密钥安全 | 私钥敏感 | 只放服务端 `.env`，不进入前端和日志 |
| 数据源冲突 | Firo、API-Football、OpenFootball 可能时间/队名不同 | 明确主数据优先级：OpenFootball 本地赛程 > API-Football 实时赛果 > Firo 市场/情报 |
| 类型覆盖不足 | 当前 `firoApi.ts` 类型未覆盖全部 odds/info 字段 | 先补 TypeScript 类型，再接业务 |

---

## 10. 实施里程碑

### M1：类型与接口补全

- 补 `fetchLotteryAllList(date?)`。
- 补 `fetchSoccerEvents(date?, isJc?)`。
- 扩展 `FiroOddsHistory`：加入 `hafuOddsList`、`ttgOddsList`、`crsOddsList`。
- 扩展 `FiroFootballInfo`：加入 `historyDetails`、`tables`、`futureDetails`。
- 更新 `server/.env.example`：补 `FIRO_API_KEY`、`FIRO_PRIVATE_KEY`。

### M2：缓存与映射

- 新增 `firo_matches`。
- 新增 `firo_odds` 或扩展现有 `odds`。
- 建立 Firo `matchId` 与本项目 `matches.id` 的映射策略：优先人工映射，其次队名归一化 + 日期。
- 增加 `pnpm sync:firo`。

### M3：预测增强

- 实现 `latestFiroMarketLine(matchId)`。
- 在 `getPrediction()` 中并入 Firo 市场摘要。
- 更新 `server/src/ai/prompt.ts`，把 Firo 数据作为“市场与情报”块加入。

### M4：前端展示

- 单场详情页新增“市场参考”卡片。
- 展示 HAD 去水概率、HHAD、TTG、CRS 低赔率比分区间、更新时间。
- 增加免责声明：仅用于预测分析，不构成投注建议。

---

## 11. 结论

FiroAPI 对当前项目最有价值的不是“赛程主数据”，而是“中文竞彩市场数据 + 单场综合情报”。本项目应继续以 OpenFootball/API-Football 作为比赛主数据和赛果主链路，把 FiroAPI 定位为增强源：

- P0：HAD 赔率和历史趋势，直接提升 AI 市场先验。
- P1：HHAD/TTG/CRS、伤停、球员数据、历史交锋明细，提升比分预测和解释质量。
- P2：按日赛程、积分榜、未来赛程，用作映射、校验和调试，不应优先进入主体验。

推荐先完成类型补全和缓存落库，再把 Firo 市场摘要接入 AI prompt；前端展示应克制，避免把产品导向投注工具。
