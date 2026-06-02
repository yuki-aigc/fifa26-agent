# 产品需求文档（PRD）· FIFA26 预测系统

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 编写日期 | 2026-06-02 |
| 文档定位 | 个人作品集项目（Portfolio）— 突出架构设计与 AI 能力亮点 |
| 项目代号 | `FIFA26-Agent` |
| 当前状态 | 前端 + 后端 MVP 已完成并打通，AI 实时调用待密钥验证 |
| 仓库 | GitHub `yuki-aigc/fifa26-agent` |

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

### 2.3 非目标（Non-Goals）
- ❌ 用户账号体系、登录、社交分享、评论。
- ❌ 实时数据采集流水线的生产级 SLA（实时比分仅作可选的 `pnpm sync` 演示）。
- ❌ 博彩/真实下注或任何资金相关功能。
- ❌ Web 端的长期维护——Web 前端定位为测试客户端，最终由 iOS App 承接。
- ❌ 多语言（当前仅中文）。

---

## 3. AI 系统需求（AI System Requirements）

### 3.1 设计原则：AI 增强 Elo，而非取代
- **Elo 引擎**（`server/src/domain/elo.ts`）：确定性、零成本、零延迟，提供 `odds/score/h2h/factors`，是**基线 + 兜底**。
- **AI 层**（`pi`）：在 Elo 先验之上，产出**结构化、可解释**的精修预测，结果缓存入 `predictions` 表。

### 3.2 工具与 API 需求
- **LLM 工具包**：`@earendil-works/pi-ai`（provider-agnostic），通过 `getModel(provider, model)` + `completeSimple` 调用。
- **结构化输出**：TypeBox 工具调用 `submit_prediction`，强制返回 `{ win, draw, loss, predScoreHome, predScoreAway, confidence, keyFactors[], reasoning }`，概率归一化到 100。
- **多模型兼容**：通过 `.env` 的 `AI_PROVIDER` / `AI_MODEL` 切换 Anthropic（`claude-sonnet-4-5`）或 OpenAI（`gpt-4o`）；支持 `AI_BASE_URL` 接入自建/代理/OpenAI 兼容网关（如 Qwen/DeepSeek），`AI_API_KEY` 覆盖标准 provider key。
- **数据源**：OpenFootball `worldcup.json`（真实抽签 + 赛程）；可选 API-Football（实时比分，免费层）；可选 Kaggle FC26 CSV（补齐 48 强阵容能力值）。

### 3.3 评估策略（Evaluation Strategy）
| 评估项 | 方法 | 通过标准 |
| --- | --- | --- |
| 结构合法性 | 校验工具调用返回是否满足 TypeBox schema，概率和是否=100 | 100% 合法或触发回退 |
| 降级正确性 | 删除密钥 / 模拟调用异常，请求 `?ai=1` | 返回 Elo 结果且 `aiFallback=true`，不抛错 |
| 提供商互换 | 切换 `AI_PROVIDER` 在 Anthropic / OpenAI 各跑一次 | 均能返回结构化预测 |
| 缓存正确性 | 同一 `(matchId, engine, model)` 重复请求 | 命中缓存；`?refresh=1` 强制重算 |
| 预测合理性（人工） | 抽样 10 场对阵，人工核对 `reasoning` 是否与 Elo 先验、双方实力一致 | ≥ 8/10 解释合理无幻觉 |

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
                                                    │   └──────────────────┬──────┘ │
                                                    │   ┌──────────────────▼──────┐ │
                                                    │   │ Drizzle ORM + SQLite     │ │
                                                    │   │ teams/players/matches/   │ │
                                                    │   │ predictions              │ │
                                                    │   └──────────────────────────┘ │
                                                    └───────────┬──────────────────────┘
                                                                │ 数据摄取 (ingest)
                              ┌─────────────────────────────────┼────────────────────────┐
                              ▼                                  ▼                        ▼
                      OpenFootball (赛程/抽签)      API-Football (实时比分,可选)   Kaggle FC26 CSV(可选)
```

### 4.2 技术栈
- **前端**：React 18 + Vite 6，纯 JS/JSX，CSS 自定义属性设计系统，React Context 全局数据，SVG 五边形雷达。
- **后端**：Node ≥ 22.19，TypeScript，Fastify 5（`@fastify/cors`、`@fastify/swagger` + swagger-ui），pnpm 10，`tsx` 开发。
- **数据层**：Drizzle ORM 0.38 + better-sqlite3（SQLite 文件 `server/data/fifa26.sqlite`，WAL + 外键）。
- **AI**：`@earendil-works/pi-ai` 0.78。

### 4.3 数据模型（Drizzle / SQLite）
- **teams**：`code`(PK) / name / en / group / confed / flagEmoji / accent / rank / fifaPoints / ovr / att / mid / def / form(json) / titles / note。
- **players**：id / teamCode(FK) / name / pos / num / age / club / pace / shooting / passing / defending / stamina / ovr；唯一键 `[teamCode, name]`。
- **matches**：id(PK, slug) / homeCode / awayCode / stage / round / group / venue / kickoff / status / homeScore / awayScore / externalId。
- **predictions**（AI 缓存）：id / matchId / engine / provider / model / win / draw / loss / predScoreHome / predScoreAway / confidence / keyFactors(json) / reasoning；唯一键 `[matchId, engine, model]`。

### 4.4 接口契约（REST API · iOS 复用）
| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /health` | 健康检查，含 AI provider/model/baseUrl/keyConfigured |
| `GET /api/teams` | 球队列表（已排序） |
| `GET /api/teams/:code` | 球队详情（含 squad）；404 `team_not_found` |
| `GET /api/players?position=&limit=` | 球员列表，可按位置筛选 |
| `GET /api/players/:id` | 球员详情（含 radar）；404 `player_not_found` |
| `GET /api/matches?status=&group=` | 赛程列表（含双方球队视图） |
| `GET /api/matches/:id` | 单场详情；404 `match_not_found` |
| `GET /api/matches/:id/prediction?ai=&refresh=` | Elo 基线；`ai=1` 触发/返回 AI 精修；`refresh=1` 强制重算 |
| `GET /docs` | Swagger UI |

### 4.5 集成点（Integration Points）
- **数据库**：本地 SQLite（无外部 DB 依赖，便于一键演示）。
- **外部 API**：OpenFootball（无需 key）；API-Football（可选 `API_FOOTBALL_KEY`，免费层 ~100 req/day，仅 `pnpm sync` 使用）；LLM 提供商端点（可选 `AI_BASE_URL`）。
- **CORS**：`origin:true`，便于本地任意端口前端联调。

### 4.6 安全与隐私（Security & Privacy）
- **密钥管理**：所有 API key 经 `.env`（已 gitignore），仓库仅提供 `.env.example`；前后端均不提交密钥。
- **无个人数据**：系统不采集、不存储任何用户 PII，无需合规审计。
- **数据来源合规**：使用公开开源数据集（OpenFootball）与免费层 API；FC26 CSV 需用户自行从 Kaggle 下载，不随仓库分发。
- **降级隔离**：AI 调用失败不影响核心查询与 Elo 预测可用性。

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

**v1.1 — 双线并进**
- *数据/AI 线*：① 用真实 AI 密钥验证 Anthropic 与 OpenAI 两条实时链路；② 导入 FC26 CSV 补齐 48 强完整阵容与能力值；③ 接入 API-Football 实时比分（`pnpm sync`）。
- *iOS 线*：① 设计 iOS App UI（沿用 animal-island 风格）；② 搭建 iOS 项目骨架并对接现有 REST API；③ 复刻赛程/球队/球员/雷达四类核心界面。

**v2.0 — 体验深化**
- 淘汰赛对阵树 / 小组出线概率推演；预测历史与命中率回看。
- iOS 推送（开球提醒）、离线缓存；可选模型对比（同场多模型预测并列）。

### 5.2 技术风险（Technical Risks）
| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `pi-ai` 实时链路尚未用真实密钥验证 | AI 路径可能存在运行时差异 | 已确保类型编译通过 + 模型 id 可解析；v1.1 首要任务即真实验证 |
| LLM 调用延迟与成本 | AI 深度预测响应慢/产生费用 | 仅在详情页按需触发；结果缓存；Elo 即时兜底 |
| FC26 CSV 需手动下载（Kaggle 登录） | 阵容数据无法自动补齐 | 提供导入 CLI + 文档说明；缺失时回退当前 16 队精选 + 默认 meta |
| API-Football 免费层限流（~100/day） | 实时比分刷新受限 | 激进缓存，按需轮询；实时为可选增强而非核心 |
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
