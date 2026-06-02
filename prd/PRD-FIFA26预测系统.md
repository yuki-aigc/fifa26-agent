# 产品需求文档（PRD）· FIFA26 预测系统

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.2 |
| 编写日期 | 2026-06-02（v1.2 更新同日） |
| 文档定位 | 个人作品集项目（Portfolio）— 突出架构设计与 AI 能力亮点 |
| 项目代号 | `FIFA26-Agent` |
| 当前状态 | MVP 已完成；**v1.2 补充世界杯开赛前数据准备：48 队阵容兜底、FiroAPI 未来 30 天赛程探测、竞足赔率上架计划、API-Football externalId 对齐任务** |
| 仓库 | GitHub `yuki-aigc/fifa26-agent` |

> **v1.1 更新摘要**：在 MVP（Elo + AI 增强预测）之上补齐**真实数据闭环**——比赛表现存储（`match_stats`：控球/射门/xG）、市场赔率（`odds` 时间序列）、真实历史交锋（`h2h_matches`，来源 API-Football `/fixtures/headtohead`）、实时同步（CLI + server 内置定时器）、预测对账（AI vs Elo 命中率），并把这些真实因素喂回 AI 提示词。前端新增**历史交锋"对阵图"**。详见各章 `v1.1` 标注。

> **v1.2 更新摘要**：补充**世界杯开赛前数据准备**要求与执行口径。当前本地种子已覆盖 48 队、72 场已定对阵，并通过开赛前占位阵容使 48 队均达到至少 11 名球员；真实阵容公布后仍需用 FC26 CSV 或最终大名单覆盖。FiroAPI 商家反馈：`/firo/tsd/soccer-events` 预计 2026-06-03 至 2026-06-04 更新，可查未来 30 天且覆盖世界杯；竞足 `/firo/sports-lottery/*` 预计 2026-06-08 更新世界杯赛程。API-Football 因免费额度限制，`externalId` 对齐与实时赔率/伤停/统计需在额度恢复后继续执行。

> **文档定位说明**：本 PRD 面向「个人作品集」场景，因此在"技术规格"与"AI 系统"两章着墨最重，意在向潜在雇主/合作者清晰呈现架构决策、数据流与工程取舍；用户增长类指标作为次要参考，不作为核心 KPI。

---

## 1. 执行摘要（Executive Summary）

### 1.1 问题陈述（Problem Statement）
FIFA26赛事预测信息分散且专业门槛高：普通球迷既缺少一个**美观、轻量、移动优先**的查询入口，也无法直观获得"既有量化基线、又有可解释 AI 分析"的比赛胜负预测。

### 1.2 解决方案（Proposed Solution）
构建一套移动端FIFA26 预测系统：以**动物之森（animal-island）风格**的游戏化 UI 呈现赛程 / 球队 / 球员三大模块与五边形能力雷达图；后端以**确定性 Elo 引擎为基线**，并用 **`pi` 工具包驱动的大模型（兼容 OpenAI / Anthropic）增强出结构化、可解释的预测**，无密钥时优雅回退 Elo。

### 1.3 成功标准（Success Criteria）
作为作品集项目，以**可演示性与工程质量**为核心衡量：

| 维度 | 可度量标准 |
| --- | --- |
| 数据真实性 | 种子数据来自 OpenFootball，覆盖真实 48 强抽签 + 104 场赛程（当前已定 72 场对阵） |
| 接口完备性 | REST API 覆盖 teams / players / matches / prediction 全部资源，`/docs` 提供 Swagger |
| 预测可解释性 | AI 路径返回 `win/draw/loss`（和为 100）+ 比分 + `keyFactors` + 中文 `reasoning` |
| 降级可靠性 | 无 AI 密钥或调用失败时，`/prediction` 100% 回退 Elo（`aiFallback=true`），不报错 |
| 一键启动 | `pnpm install && pnpm db:push && pnpm seed && pnpm dev` 可在干净环境跑通 |
| 首屏性能 | 前端列表概率条由客户端 Elo 即时计算，无需等待后端 N 次预测请求 |
| 真实交锋（v1.1） | 48 强全部解析 API-Football team id；逐对回填真实历史交锋入 `h2h_matches`，详情页"对阵图"展示真实比分（无数据则标注估算） |
| 表现可追溯（v1.1） | `match_stats` 存控球/射门/xG 等；从已结束比赛实时派生真实积分/净胜球/近期 form |
| 预测对账（v1.1） | 比赛结束后自动给缓存预测打分，`GET /api/accuracy` 输出 AI 与 Elo 的胜平负/精确比分命中率 |
| 赛前数据准备（v1.2） | 开赛前 48 队均有 ≥11 名球员可展示；真实名单公布后占位球员比例降至 0%；已定 72 场对阵均完成 `externalId` 或 Firo `matchId` 映射之一 |
| 赛前市场先验（v1.2） | Firo/API-Football 任一来源对世界杯已定赛程上架后，24 小时内将可匹配场次的 HAD/1X2 赔率写入 `odds`，并进入 `/prediction` 的 AI prompt |

---

## 2. 用户体验与功能（UX & Functionality）

### 2.1 用户画像（Personas）
- **球迷·小C**：FIFA26期间想随手查"今晚哪场、谁更强、比分大概多少"，看重界面好看、加载快、结论直观。
- **技术评审·阅卷人**：浏览本作品集，关注架构清晰度、数据来源真实性、AI 集成方式与降级策略。
- **未来 iOS 用户**：通过原生 App 消费同一套后端 API，体验与 Web 一致或更佳。

### 2.2 用户故事与验收标准（User Stories & Acceptance Criteria）

**US-1 赛程浏览**
> 作为球迷，我想浏览全部FIFA26赛程并一眼看到每场的胜/平/负概率，以便快速判断关注哪场。
- 顶部展示"今日焦点"大卡；下方按时间列出全部赛程。
- 每场带客户端 Elo 即时算出的三段概率条（速度优先于精度）。
- 每场显示双方旗帜（emoji）、阶段标签、开球时间（本地化格式）。

**US-2 单场预测详情**
> 作为球迷，我想点进一场比赛看更详细的预测与依据，以便理解"为什么"。
- 默认调用后端 `/prediction`，返回 Elo 基线：预测比分、置信度、实力对比、历史交锋、关键因素。
- 提供「🤖 AI 深度预测」按钮，点击后以 `?ai=1` 触发大模型结构化预测 + 中文分析。
- 当 `engine==='ai'` 时展示 `reasoning` 与 `keyFactors`；当 `aiFallback===true` 时显示"未配置 AI 密钥，已回退 Elo"提示。

**US-3 球队分析**
> 作为球迷，我想查看 48 强实力榜与单队详情，以便了解球队整体强弱。
- 实力榜按综合评分排序；详情含综合评分、攻/中/防数据条、近 5 场战绩、阵容列表。

**US-4 球员能力雷达**
> 作为球迷，我想查看球星的五维能力雷达，以便直观对比球员特点。
- 球星库支持按位置（FW/MF/DF/GK）筛选。
- 球员详情含五边形雷达图：**速度 · 射门 · 传球 · 防守 · 体能**。

**US-5 历史交锋对阵图（v1.1）**
> 作为球迷，我想在详情页直观看到两队的真实历史交锋，以便判断心理优势与近况。
- 详情页"历史交锋"区为**对阵图**：双方旗帜对脸 + VS 徽章、按场次比例的"拔河"平衡条（主胜/平/客胜）、最近交锋时间线（日期 · 比分胶囊按胜负着色 · 赛事中文标签）。
- 数据来自后端 `h2hReal` / `h2hRecent`；有真实数据时标"N 次交锋"，无数据时使用 Elo 估算并显式标注"模型估算"。

**US-6 实时比分与赛事内战绩（v1.1）**
> 作为球迷，赛事期间我想看到开赛时间、实时比分/进行分钟，以及小组真实战绩。
- `matches` 含 `kickoff` / `status`（scheduled/live/finished）/ `elapsed`；详情页 `/api/matches/:id` 返回双方 `match_stats` 与最新赔率。
- 比赛结束后系统从真实结果派生积分/净胜球/近期 form，覆盖静态策展值。

**US-7 预测可信度回看（v1.1）**
> 作为技术评审，我想看到模型的真实命中率，以便评估 AI 相对 Elo 的增益。
- 比赛结束后自动对账缓存预测；`GET /api/accuracy` 按引擎/模型聚合胜平负命中率与精确比分命中率。

**US-8 赛前数据准备（v1.2）**
> 作为项目维护者，我想在世界杯开赛前确认赛程、阵容、赔率、伤停等关键数据是否已经可用，以便赛前预测不是只依赖静态 Elo。
- 运行 `pnpm seed` 后，48 队均至少有 11 名球员可展示；占位球员以 `club="开赛前名单待公布"` 标识，AI prompt 不引用占位球员。
- 运行 `pnpm sync:firo` 后，系统按未来 30 天扫描 `/firo/tsd/soccer-events`，记录世界杯覆盖情况；当事件包含竞彩 `matchId` 时，自动拉 `/firo/sports-lottery/odds` 并写入 `odds` 表。
- API-Football 额度恢复后，运行 `pnpm sync:ids` 只做 fixture id 对齐，不消耗统计/赔率/伤停额外请求；对齐成功后再运行正式 `pnpm sync` 拉实时数据。
- 数据准备状态至少能通过数据库计数或健康检查确认：`teams=48`、`matches>=72`、`teams_with_11_players=48`、`matches_with_external_id` 或 Firo 匹配数持续增长。

### 2.3 非目标（Non-Goals）
- ❌ 用户账号体系、登录、社交分享、评论。
- ❌ 实时数据采集流水线的生产级 SLA（已提供 `pnpm sync` + server 内置定时器作演示，但不承诺高可用；且 API-Football 免费层仅覆盖 2022–2024 赛季，2026 实时赛果需付费层）。
- ❌ 博彩/真实下注或任何资金相关功能。
- ❌ Web 端的长期维护——Web 前端定位为测试客户端，最终由 iOS App 承接。
- ❌ 多语言（当前仅中文）。

---

## 3. AI 系统需求（AI System Requirements）

### 3.1 设计原则：AI 增强 Elo，而非取代
- **Elo 引擎**（`server/src/domain/elo.ts`）：确定性、零成本、零延迟，提供 `odds/score/h2h/factors`，是**基线 + 兜底**。
- **AI 层**（`pi`）：在 Elo 先验之上，产出**结构化、可解释**的精修预测，结果缓存入 `predictions` 表。
- **真实因素喂回（v1.1）**：AI 提示词除 Elo 先验外，现额外注入**本届真实战绩**（积分/净胜球）、**场均真实表现**（控球/射门/xG，来自 `match_stats`）与**市场赔率隐含概率**（来自 `odds`，去水归一）。实测中模型会主动引用这些因素并对市场与 Elo 的分歧给出判断。
- **赛前数据分层（v1.2）**：开赛前数据按可信度进入 AI：真实/策展球员名单可进入核心球员块；`club="开赛前名单待公布"` 的占位球员只用于前端不空态，不进入 AI prompt；Firo/API-Football 赔率进入“市场先验”块；伤停只在来源明确且匹配到本项目比赛时进入。

### 3.2 工具与 API 需求
- **LLM 工具包**：`@earendil-works/pi-ai`（provider-agnostic），通过 `getModel(provider, model)` + `completeSimple` 调用。
- **结构化输出**：TypeBox 工具调用 `submit_prediction`，强制返回 `{ win, draw, loss, predScoreHome, predScoreAway, confidence, keyFactors[], reasoning }`，概率归一化到 100。
- **多模型兼容**：通过 `.env` 的 `AI_PROVIDER` / `AI_MODEL` 切换 Anthropic（`claude-sonnet-4-5`）或 OpenAI（`gpt-4o`）；支持 `AI_BASE_URL` 接入自建/代理/OpenAI 兼容网关（如 Qwen/DeepSeek），`AI_API_KEY` 覆盖标准 provider key。
- **数据源**：OpenFootball `worldcup.json`（真实抽签 + 赛程）；API-Football（实时比分/比赛统计/赔率/历史交锋，免费层）；FiroAPI（中文足球按日赛程、竞彩赛程、HAD/HHAD/TTG/CRS 赔率历史、单场综合情报）；可选 Kaggle FC26 CSV（补齐 48 强阵容能力值）。
- **真实历史交锋（v1.1）**：`pnpm h2h` 解析各队 API-Football team id（WC2022 批量 + 名称搜索兜底，排除青年队/女足变体），逐对调 `/fixtures/headtohead` 回填真实交锋至 `h2h_matches`；`h2h_pairs` 登记表保证**断点续抓**且区分"已查无交锋"与"未查"。所有 API-Football 调用共享**全局限速（6.5s/次）+ 429 退避重试**以适配免费层 10 次/分。
- **赛前 Firo 接入（v1.2）**：`pnpm sync:firo` 默认扫描未来 30 天 `/firo/tsd/soccer-events`；商家确认该接口预计 2026-06-03 至 2026-06-04 覆盖世界杯，竞足 `/firo/sports-lottery/*` 预计 2026-06-08 更新世界杯赛程。同步逻辑先按队名+开球时间匹配本项目 `matches`，若事件含竞彩 `matchId` 则拉 `/firo/sports-lottery/odds` 的 HAD 赔率写入 `odds`。

### 3.3 评估策略（Evaluation Strategy）
| 评估项 | 方法 | 通过标准 |
| --- | --- | --- |
| 结构合法性 | 校验工具调用返回是否满足 TypeBox schema，概率和是否=100 | 100% 合法或触发回退 |
| 降级正确性 | 删除密钥 / 模拟调用异常，请求 `?ai=1` | 返回 Elo 结果且 `aiFallback=true`，不抛错 |
| 提供商互换 | 切换 `AI_PROVIDER` 在 Anthropic / OpenAI 各跑一次 | 均能返回结构化预测 |
| 缓存正确性 | 同一 `(matchId, engine, model)` 重复请求 | 命中缓存；`?refresh=1` 强制重算 |
| 预测合理性（人工） | 抽样 10 场对阵，人工核对 `reasoning` 是否与 Elo 先验、双方实力一致 | ≥ 8/10 解释合理无幻觉 |
| 真实链路（v1.1，已验证） | 经 DashScope 网关（`qwen3.7-max`，OpenAI 兼容）实跑 `?ai=1` | 返回合法结构化预测，`reasoning` 引用真实战绩/xG/赔率 |
| 命中率对账（v1.1） | 比赛结束后 `gradeAllFinished` 打分，`/api/accuracy` 聚合 | 胜平负/精确比分命中数与比率按引擎可对比（AI vs Elo） |
| 占位名单隔离（v1.2） | 抽样请求占位球队的 `?ai=1` prompt / response | AI 不引用“开赛前名单待公布”球员作为核心球员或关键因素 |
| Firo 赛前同步（v1.2） | 2026-06-03 后每日运行 `pnpm sync:firo`；2026-06-08 后重点检查竞足赔率 | `soccer-events` 匹配到世界杯赛程；有 `matchId` 的场次写入 `odds` 且 `/prediction` 返回 `odds` 字段 |
| API-Football 对齐（v1.2） | 额度恢复后运行 `pnpm sync:ids` | 已定 72 场中可被 API-Football 覆盖的比赛均写入 `externalId`，同步失败不影响 seed/Elo 可用性 |

---

## 4. 技术规格（Technical Specifications）

### 4.1 架构总览（Architecture Overview）

```
┌─────────────────────┐        HTTP/JSON         ┌──────────────────────────────┐
│  客户端              │  ───────────────────────▶ │  server/  (Fastify 5)         │
│  · React+Vite (Web,  │                            │  ┌──────────┐  ┌────────────┐ │
│    测试客户端)        │  ◀─────────────────────── │  │ routes   │─▶│ services   │ │
│  · iOS App (规划中)   │      teams/matches/        │  └──────────┘  └─────┬──────┘ │
│  · 客户端 Elo 即时    │      players/prediction    │                      │        │
│    概率条             │                            │   ┌──────────────────▼──────┐ │
└─────────────────────┘                            │   │ domain/elo.ts (基线/兜底) │ │
                                                    │   └──────────────────┬──────┘ │
                                                    │   ┌──────────────────▼──────┐ │
                                                    │   │ ai/ (pi → LLM, 缓存)     │ │
                                                    │   │  先验: Elo+战绩+xG+赔率   │ │
                                                    │   └──────────────────┬──────┘ │
                                                    │   ┌──────────────────▼──────┐ │
                                                    │   │ Drizzle ORM + SQLite     │ │
                                                    │   │ teams/players/matches/   │ │
                                                    │   │ predictions/match_stats/ │ │
                                                    │   │ odds/h2h_matches/h2h_pairs│ │
                                                    │   └──────────────────────────┘ │
                                                    │   ┌──────────────────────────┐ │
                                                    │   │ 内置定时器 scheduler →    │ │
                                                    │   │ runSync(比分/统计/赔率)   │ │
                                                    │   │ → 重算 form + 预测对账    │ │
                                                    │   └──────────────────────────┘ │
                                                    └───────────┬──────────────────────┘
                                                                │ 数据摄取 (ingest)
                              ┌─────────────────────────────────┼────────────────────────┬────────────────────┐
                              ▼                                  ▼                        ▼                    ▼
                      OpenFootball (赛程/抽签)   API-Football (比分/统计/赔率/交锋)   FiroAPI(赛前赔率/赛程)   Kaggle FC26 CSV(可选)
```

### 4.2 技术栈
- **前端**：React 18 + Vite 6，纯 JS/JSX，CSS 自定义属性设计系统，React Context 全局数据，SVG 五边形雷达。
- **后端**：Node ≥ 22.19，TypeScript，Fastify 5（`@fastify/cors`、`@fastify/swagger` + swagger-ui），pnpm 10，`tsx` 开发。
- **数据层**：Drizzle ORM 0.38 + better-sqlite3（SQLite 文件 `server/data/fifa26.sqlite`，WAL + 外键）。
- **AI**：`@earendil-works/pi-ai` 0.78。

### 4.3 数据模型（Drizzle / SQLite）
- **teams**：`code`(PK) / name / en / group / confed / flagEmoji / accent / rank / **apiId（v1.1，API-Football team id）** / fifaPoints / ovr / att / mid / def / form(json) / titles / note。
- **players**：id / teamCode(FK) / name / pos / num / age / club / pace / shooting / passing / defending / stamina / ovr；唯一键 `[teamCode, name]`。**v1.2**：`pnpm seed` 会为未补齐真实名单的队伍生成 `club="开赛前名单待公布"` 的占位阵容，使 48 队均 ≥11 人；AI prompt 会过滤这些占位球员。
- **matches**：id(PK, slug) / homeCode / awayCode / stage / round / group / venue / kickoff / status / **elapsed（v1.1，进行分钟）** / homeScore / awayScore / externalId；索引含 status / externalId。
- **predictions**（AI 缓存 + 对账）：id / matchId / engine / provider / model / win / draw / loss / predScoreHome / predScoreAway / confidence / keyFactors(json) / reasoning / **correctOutcome / correctScore / gradedAt（v1.1，对账）**；唯一键 `[matchId, engine, model]`。
- **match_stats**（v1.1，比赛表现）：id / matchId(FK) / teamCode(FK) / isHome / goals / possession / shots / shotsOnTarget / xg / corners / fouls / yellow / red；唯一键 `[matchId, teamCode]`。
- **odds**（v1.1，赔率时间序列）：id / matchId(FK) / bookmaker / homeWin / draw / awayWin / capturedAt（十进制赔率，按抓取时间追加）。**v1.2**：允许来源为 API-Football 1X2 或 Firo HAD；Firo 写入时 `bookmaker` 使用 `Firo HAD #{matchId}` 标识。
- **h2h_matches**（v1.1，真实历史交锋）：id / aCode / bCode（字典序规范化）/ playedOn / aScore / bScore / competition / externalId；`externalId` 唯一去重。
- **h2h_pairs**（v1.1，抓取登记）：aCode / bCode（PK）/ fetchedAt / meetings——保证断点续抓、区分"已查无交锋"。

### 4.4 接口契约（REST API · iOS 复用）
| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /health` | 健康检查，含 AI provider/model/baseUrl/keyConfigured + **定时同步状态（v1.1）** |
| `GET /api/teams` | 球队列表（已排序） |
| `GET /api/teams/:code` | 球队详情（含 squad）；404 `team_not_found` |
| `GET /api/players?position=&limit=` | 球员列表，可按位置筛选 |
| `GET /api/players/:id` | 球员详情（含 radar）；404 `player_not_found` |
| `GET /api/matches?status=&group=` | 赛程列表（含双方球队视图、`elapsed`） |
| `GET /api/matches/:id` | 单场详情；**v1.1 增加 `stats`（双方表现）+ `odds`（最新盘口+隐含概率）**；404 `match_not_found` |
| `GET /api/matches/:id/prediction?ai=&refresh=` | Elo 基线；`ai=1` 触发/返回 AI 精修；`refresh=1` 强制重算。**v1.1 响应增加 `records`（本届战绩）/ `teamStats`（场均）/ `h2hReal` / `h2hRecent` / `odds`** |
| `GET /api/accuracy` | **（v1.1）** 预测对账：按引擎/模型聚合胜平负与精确比分命中率 |
| `GET /api/lottery/matches` | **（v1.2）** Firo 竞足赛程透传；未配置 Firo key 时返回 `firo_not_configured` |
| `GET /api/lottery/matches/:id` | **（v1.2）** Firo 单场综合情报 + 赔率历史透传；用于调试和后续市场参考卡片 |
| `GET /docs` | Swagger UI |

### 4.5 集成点（Integration Points）
- **数据库**：本地 SQLite（无外部 DB 依赖，便于一键演示）。
- **外部 API**：OpenFootball（无需 key）；API-Football（可选 `API_FOOTBALL_KEY`，免费层 ~100 req/day 且限 10 req/min、仅 2022–2024 赛季；供 `pnpm sync` / `pnpm h2h` / 内置定时器使用）；FiroAPI（可选 `FIRO_API_KEY` + `FIRO_PRIVATE_KEY`，RSA-SHA256 签名；供 `pnpm sync:firo` 与 `/api/lottery/*` 使用）；LLM 提供商端点（可选 `AI_BASE_URL`）。
- **定时同步（v1.1）**：`SYNC_ENABLED=true` 时 server 启动按 `SYNC_INTERVAL_MIN` 调 `runSync`（`SYNC_MODE=live/full`，含防重叠）；亦可纯 CLI（`pnpm sync --live|--date=`）由外部 cron 驱动。
- **赛前同步（v1.2）**：`pnpm sync:ids` 只对齐 API-Football fixture id，不拉统计/赔率/伤停，适合免费额度恢复后的低成本准备；`pnpm sync:firo` 默认扫描未来 30 天 Firo 足球赛程，匹配世界杯并在有竞彩 `matchId` 时写入 HAD 赔率。
- **CORS**：`origin:true`，便于本地任意端口前端联调。

### 4.6 安全与隐私（Security & Privacy）
- **密钥管理**：所有 API key 经 `.env`（已 gitignore），仓库仅提供 `.env.example`；前后端均不提交密钥。Firo 私钥为 PKCS#8 DER base64，仅服务端读取，禁止写入前端 bundle 或日志。
- **无个人数据**：系统不采集、不存储任何用户 PII，无需合规审计。
- **数据来源合规**：使用公开开源数据集（OpenFootball）与免费层 API；FC26 CSV 需用户自行从 Kaggle 下载，不随仓库分发。
- **降级隔离**：AI 调用失败不影响核心查询与 Elo 预测可用性。
- **数据合规边界**：Firo/API-Football 赔率仅作为“市场参考/预测先验”，产品不提供投注建议、投注入口或资金相关能力。

---

## 5. 风险与路线图（Risks & Roadmap）

### 5.1 分阶段路线图（iOS 与 数据/AI 并重）

> 用户确认下阶段为「两者并重」：iOS 客户端与数据/AI 深化作为**并行工作流**推进。

**MVP（已完成）**
- [x] React+Vite 前端三大模块 + 五边形雷达，动物之森视觉。
- [x] Fastify + Drizzle/SQLite 后端，全套 REST API + Swagger。
- [x] OpenFootball 种子（48 队 / 72 场对阵 / 83 名球员）。
- [x] Elo 基线引擎 + `pi` AI 增强（结构化输出 + 缓存 + 回退）。
- [x] 前端接入实时后端作为测试客户端。

**v1.1 — 真实数据闭环（已完成）**
- [x] AI 实时链路验证（DashScope / `qwen3.7-max`，OpenAI 兼容网关）。
- [x] 比赛表现存储 `match_stats` + 真实战绩派生（积分/净胜球/真实 form）。
- [x] 市场赔率 `odds`（时间序列 + 去水隐含概率），并喂回 AI 先验。
- [x] 真实历史交锋 `h2h_matches`（API-Football `/fixtures/headtohead`），48 强 id 全部解析，断点续抓登记。
- [x] 实时同步 `runSync`（比分/状态/`elapsed`/统计/赔率）+ server 内置定时器；全局限速 + 429 退避。
- [x] 预测对账 `gradeAllFinished` + `GET /api/accuracy`（AI vs Elo 命中率）。
- [x] 前端历史交锋"对阵图"（拔河平衡条 + 交锋时间线）。
- [ ] 导入 FC26 CSV 补齐 48 强完整阵容（可选，待办）。
- [ ] 2026 实时赛果需 API-Football 付费层（免费层仅 2022–2024）。

**v1.2 — 世界杯开赛前数据准备（进行中）**
- [x] 48 队阵容展示兜底：`pnpm seed` 后所有球队均 ≥11 名球员；占位球员以 `开赛前名单待公布` 标识，AI prompt 过滤占位球员。
- [x] FiroAPI 基础接入：`FIRO_API_KEY` / `FIRO_PRIVATE_KEY` 配置、RSA-SHA256 签名、`/api/lottery/*` 调试接口。
- [x] Firo 未来 30 天赛程扫描：`pnpm sync:firo` 优先调用 `/firo/tsd/soccer-events`，匹配本项目世界杯赛程；若返回竞彩 `matchId`，自动拉 `/firo/sports-lottery/odds` 写入 HAD 赔率。
- [x] API-Football 低成本对齐入口：`pnpm sync:ids` 只做 fixture id 对齐，不拉统计/赔率/伤停，适合免费额度恢复后执行。
- [ ] 2026-06-03 至 2026-06-04 后验证 Firo `soccer-events` 是否覆盖世界杯未来 30 天赛程，目标：已定小组赛可匹配场次 ≥72 或明确记录未覆盖原因。
- [ ] 2026-06-08 后验证 Firo 竞足世界杯赛程与赔率上架，目标：有竞彩 `matchId` 的世界杯场次 HAD 赔率写入 `odds`，并进入 `/prediction` 的 `odds` 字段。
- [ ] API-Football 额度恢复后跑 `pnpm sync:ids`，目标：可覆盖场次的 `matches.externalId` 完成回写；再按需跑正式 `pnpm sync` 拉实时赔率/伤停/统计。
- [ ] 用真实最终名单或 FC26 CSV 覆盖占位阵容，目标：`club="开赛前名单待公布"` 的球员数降至 0。

**v1.3 — iOS 线**
- ① 设计 iOS App UI（沿用 animal-island 风格）；② 搭建 iOS 项目骨架并对接现有 REST API；③ 复刻赛程/球队/球员/雷达/对阵图核心界面。

**v2.0 — 体验深化**
- 淘汰赛对阵树 / 小组出线概率推演；命中率走势与多模型对比（同场多模型预测并列）。
- iOS 推送（开球提醒）、离线缓存。

### 5.2 技术风险（Technical Risks）
| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `pi-ai` 实时链路尚未用真实密钥验证 | AI 路径可能存在运行时差异 | 已确保类型编译通过 + 模型 id 可解析；v1.1 首要任务即真实验证 |
| LLM 调用延迟与成本 | AI 深度预测响应慢/产生费用 | 仅在详情页按需触发；结果缓存；Elo 即时兜底 |
| FC26 CSV 需手动下载（Kaggle 登录） | 阵容数据无法自动补齐 | 提供导入 CLI + 文档说明；缺失时回退当前 16 队精选 + 默认 meta |
| API-Football 免费层限流（~100/day） | 实时比分刷新受限 | 激进缓存，按需轮询；实时为可选增强而非核心 |
| API-Football 当日额度耗尽（v1.2） | 无法当天完成 `externalId`、赔率、伤停、统计同步 | 拆出 `pnpm sync:ids` 低成本任务；当天用 Firo `soccer-events` 探测赛程，额度恢复后补跑 |
| Firo 世界杯数据未到上架日期（v1.2） | `sync:firo` 暂时匹配 0 场、`odds` 仍为空 | 按商家反馈等待 2026-06-03/04 的 `soccer-events` 更新与 2026-06-08 的竞足更新；每日运行脚本并记录覆盖数 |
| Firo 队名/时间映射不稳定（v1.2） | 赔率可能无法写入本项目 `matches` | 采用中文名/英文名归一化 + 开球时间 48 小时窗口；必要时增加人工 alias 映射表 |
| 占位阵容被误用于 AI（v1.2） | AI 分析引用不存在球员，降低可信度 | prompt 层过滤 `club="开赛前名单待公布"`；前端可展示占位但需在最终名单公布后覆盖 |
| Node 原生模块 ABI（better-sqlite3） | 新 Node 版本需从源码编译 | 已配置 `pnpm.onlyBuiltDependencies`，文档记录从源码 rebuild 步骤 |
| 球队 meta 仅覆盖 47/48 | 个别队伍使用默认强度 | `DEFAULT_META` 兜底；v1.1 随 CSV 一并补齐 |

---

## 附录 A · 本地启动

```bash
# 后端 (端口 8787)
cd server && pnpm install && pnpm db:push && pnpm seed && pnpm dev

# 前端 (另开终端)
npm install && npm run dev      # http://localhost:5173
```

前端通过 `VITE_API_BASE`（默认 `http://localhost:8787`）连接后端；后端未启动时首屏提示"无法连接后端"。

## 附录 B · 关键目录
```
src/                React+Vite 前端（测试客户端）
  data/{api,store,elo}.js   后端客户端 / 全局数据 / 客户端 Elo
  screens/Screens.jsx       六个屏幕（详情页调后端预测，含 AI 切换）
server/             Fastify + Drizzle/SQLite + pi AI 后端
  src/domain/elo.ts         确定性基线引擎
  src/ai/                   pi 模型解析 / 预测工具 / 提示词 / 预测器
  src/routes/index.ts       REST 路由
  src/ingest/               OpenFootball / API-Football / FC26 数据摄取
prd/                本文档所在目录
```

## 附录 C · 赛前数据准备命令（v1.2）

```bash
# 1) 建表 + 种子：48 队、72 场已定对阵、阵容兜底
cd server
pnpm db:push
pnpm seed

# 2) Firo 未来 30 天扫描：优先 soccer-events，若有 matchId 则写入 HAD 赔率
pnpm sync:firo

# 3) API-Football 额度恢复后：低成本 fixture id 对齐
pnpm sync:ids

# 4) API-Football 正式同步：按需拉赔率/伤停/统计
pnpm sync --no-stats --no-injuries   # 先只拉赛果/状态/赔率
pnpm sync --date=2026-06-11          # 比赛日按日期拉
pnpm sync --live                     # 比赛中低频轮询
```

### 数据准备验收查询

```bash
sqlite3 server/data/fifa26.sqlite "
select 'teams', count(*) from teams
union all select 'matches', count(*) from matches
union all select 'players', count(*) from players
union all select 'teams_with_11_players', count(*) from (
  select team_code from players group by team_code having count(*) >= 11
)
union all select 'matches_with_external_id', count(*) from matches where external_id is not null
union all select 'odds', count(*) from odds
union all select 'injuries', count(*) from injuries
union all select 'match_stats', count(*) from match_stats;
"
```

开赛前最低可接受状态：

- `teams = 48`
- `matches >= 72`
- `teams_with_11_players = 48`
- `matches_with_external_id > 0` 或 Firo `sync:firo` 明确匹配到世界杯赛程
- `odds > 0`（Firo 或 API-Football 任一来源上架后 24 小时内达成）
- `club="开赛前名单待公布"` 的占位球员在最终名单公布后逐步降至 0
