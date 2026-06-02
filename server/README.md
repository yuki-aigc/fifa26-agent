# FIFA26 预测系统 · 后端 API

Fastify + Drizzle/SQLite + [`pi`](https://github.com/earendil-works/pi) AI 的预测后端。为后续 iOS App 提供 JSON REST 接口。

## 技术栈

- **Fastify 5** — HTTP 服务 + Swagger 文档 (`/docs`)
- **Drizzle ORM + better-sqlite3** — 类型安全的 SQLite 持久层
- **@earendil-works/pi-ai** — 提供者无关的 LLM 调用,**同时兼容 OpenAI 与 Anthropic**
- **pnpm** + TypeScript (Node ≥ 22.19)

## 数据来源

| 类别 | 来源 | 说明 |
|---|---|---|
| 球队身份 / 分组 / 旗帜 | [OpenFootball `worldcup.json`](https://github.com/openfootball/worldcup.json) | 免费、公共领域。48 队真实抽签结果。 |
| 赛程 (104 场) | OpenFootball | 真实日期/场馆/分组。淘汰赛对阵未定时跳过 (种子后为 72 场已定对阵)。 |
| 球队实力 / 排名 | `src/ingest/data/teamMeta.ts` | 按 2026 年中状态策展的合理估值,可被下方数据覆盖。 |
| 球员五维属性 | `src/ingest/data/players.ts` (16 队) + 可选 FC26 CSV | 速度/射门/传球/防守/体能。 |
| 实时比分 / 状态 / 进行分钟 | [API-Football](https://www.api-football.com/) (免费档) | `pnpm sync` 或内置定时器,需 `API_FOOTBALL_KEY`。种子流程不依赖。 |
| 比赛统计 (控球/射门/xG) | API-Football `/fixtures/statistics` | 写入 `match_stats`,作为 AI 分析的真实表现因素。 |
| 1X2 赔率 (盘口) | API-Football `/odds` | 写入 `odds`(时间序列),隐含概率喂给 AI 作强先验。 |

> **补全全部 48 队球员**:从 Kaggle 下载 “FC 26 player data” CSV,放到 `data/cache/fc26.csv`,运行
> `pnpm tsx src/ingest/sources/fc26.ts data/cache/fc26.csv 23`,会按国家队归类覆盖球员表。

## 快速开始

```bash
cd server
cp .env.example .env          # 按需填入 AI / API-Football key
pnpm install
pnpm rebuild better-sqlite3   # 如首次安装未编译原生模块
pnpm db:push                  # 建表 (SQLite -> ./data/fifa26.sqlite)
pnpm seed                     # 拉取真实数据写入 (无需任何 key)
pnpm dev                      # http://localhost:8787  ·  文档 /docs
```

## AI 预测 (pi · 增强 Elo)

- **Elo 基线**:`src/domain/elo.ts`(由前端原型移植),即时、免费、确定性,作为快速基线与 AI 兜底。
- **AI 增强**:`src/ai/predictor.ts` 把双方球队+核心球员数据、Elo 先验、**本届真实战绩(积分/净胜球)、场均表现(控球/射门/xG)、市场赔率隐含概率**一并喂给 LLM,经 TypeBox 工具调用返回结构化预测(胜平负/比分/置信度/关键因素/分析),结果缓存在 `predictions` 表。
- **切换提供者**:改 `.env` 的 `AI_PROVIDER` + `AI_MODEL`,并提供对应 key:
  - `AI_PROVIDER=anthropic` `AI_MODEL=claude-sonnet-4-5` + `ANTHROPIC_API_KEY`
  - `AI_PROVIDER=openai` `AI_MODEL=gpt-4o` + `OPENAI_API_KEY`
- **自定义端点 / 网关**:设 `AI_BASE_URL`(覆盖所选提供者的请求地址,适用于代理、自托管、或 OpenAI 兼容网关),并用 `AI_API_KEY` 显式指定 key(当网关 key 与提供者标准环境变量不一致时必填)。两者留空则用提供者默认端点 + 标准环境变量 key。当前配置可在 `GET /health` 查看。
- **无 key 时**:`/prediction?ai=1` 自动回退到 Elo,响应里 `aiFallback=true`。

## API

| 方法 / 路径 | 说明 |
|---|---|
| `GET /health` | 健康检查 + 当前 AI 配置 + 定时同步状态 |
| `GET /api/teams` | 球队列表 (按综合实力排序) |
| `GET /api/teams/:code` | 球队详情 + 阵容 (含五维) |
| `GET /api/players?position=FW&limit=20` | 球员列表 (可按位置筛选) |
| `GET /api/players/:id` | 球员详情 (五维雷达) |
| `GET /api/matches?status=&group=A` | 赛程列表 (含 `elapsed` 进行分钟) |
| `GET /api/matches/:id` | 单场详情 + `stats`(双方表现) + `odds`(最新盘口+隐含概率) |
| `GET /api/matches/:id/prediction?ai=1&refresh=1` | 预测:默认 Elo 基线;`ai=1` 叠加/触发缓存的 LLM 预测;`refresh=1` 强制重算。响应含 `records`(本届战绩)、`teamStats`(场均)、`h2hReal`、`odds` |
| `GET /api/accuracy` | 预测对账:AI / Elo 各自的胜平负命中率与精确比分命中率 |

## 脚本

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm db:push` — 应用 schema   ·   `pnpm db:studio` — Drizzle Studio
- `pnpm seed` — 种子真实数据(幂等,不会清掉已落库的真实赛果)
- `pnpm sync` — API-Football 实时刷新(比分/状态/elapsed + match_stats + odds,随后重算 form 并给预测打分)
  - `pnpm sync --live` 只拉进行中的比赛(比赛日省额度) · `pnpm sync --date=2026-06-11` 只拉某天
  - `pnpm sync --no-stats` / `--no-odds` 关掉对应抓取
- **内置定时器**:设 `SYNC_ENABLED=true`(+ `API_FOOTBALL_KEY`),server 启动后每 `SYNC_INTERVAL_MIN` 分钟自动 `runSync`,无需外部 cron(见 `src/ingest/scheduler.ts`)。

## 结构

```
src/
  index.ts          Fastify 启动 (cors / swagger / 路由 / 定时同步)
  config.ts         环境变量 (含 sync 调度)
  db/               schema.ts (teams/players/matches/predictions/match_stats/odds) + client.ts
  domain/           types.ts + elo.ts (胜率引擎)
  ingest/           seed.ts / sync.ts (runSync) / scheduler.ts / mappers.ts / sources/ / data/
  ai/               pi.ts / predictTool.ts / prompt.ts / predictor.ts
  services/         teams / players / matches / predictions / standings / stats / odds / accuracy
  routes/           REST 路由
```
