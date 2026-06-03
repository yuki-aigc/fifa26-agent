# FIFA26-Agent 优化任务规划

## 目标
对 FIFA26-Agent 项目进行系统性优化，覆盖前端性能、代码结构、后端查询效率、AI 可靠性及工程化配置。

## 整体进度
- 阶段1 🔴 高优先级 - 前端优化 `[~]`
- 阶段2 🟡 中优先级 - 后端优化 `[ ]`
- 阶段3 🟢 低优先级 - 工程化配置 `[~]`

---

## 阶段1：前端高优先级优化 🔴

**状态：** `in_progress`

### 任务清单

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 1.1 | 数据加载懒加载改造（按 tab 加载，失败重试） | `src/data/store.jsx` `src/App.jsx` | `[x]` |
| 1.2 | MatchDetailScreen 添加 AbortController 请求取消 | `src/screens/Screens.jsx` `src/data/api.js` | `[x]` |
| 1.3 | Screens.jsx 按屏幕拆分为多个文件 | `src/screens/` | `[ ]` |
| 1.4 | 高频内联样式提取到 styles.css | `src/screens/` `src/styles.css` | `[ ]` |
| 1.5 | App.jsx Shell 路由逻辑用 screens map 替代 if/else 链 | `src/App.jsx` | `[ ]` |
| 1.6 | StatusBar 定时器从 1s 改为对齐下一分钟 | `src/App.jsx` | `[ ]` |

### 涉及文件
- `src/App.jsx`
- `src/data/store.jsx`
- `src/data/api.js`
- `src/screens/Screens.jsx`（拆分目标）
- `src/styles.css`

---

## 阶段2：后端中优先级优化 🟡

**状态：** `pending`

### 任务清单

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 2.1 | 修复 /api/matches N+1 查询（改为 JOIN 单次查询） | `server/src/services/matches.ts` `server/src/routes/index.ts` | `[ ]` |
| 2.2 | AI 预测缓存加 inputHash（伤病/赔率变化自动失效） | `server/src/db/schema.ts` `server/src/services/predictions.ts` | `[ ]` |
| 2.3 | AI 预测链路接入 trackError + metrics（latency/token/cost） | `server/src/ai/predictor.ts` `server/src/observability/` | `[ ]` |
| 2.4 | 评估客户端/服务端 Elo 双实现合并方案 | `src/data/elo.js` `server/src/domain/elo.ts` | `[ ]` |

### 涉及文件
- `server/src/routes/index.ts`
- `server/src/services/matches.ts`
- `server/src/services/predictions.ts`
- `server/src/db/schema.ts`
- `server/src/ai/predictor.ts`
- `server/src/observability/metrics.ts`
- `server/src/observability/errorTracker.ts`

---

## 阶段3：工程化低优先级优化 🟢

**状态：** `pending`

### 任务清单

| # | 任务 | 文件 | 状态 |
|---|------|------|------|
| 3.1 | CORS 配置从 `origin: true` 改为 env 白名单 | `server/src/index.ts` `server/.env.example` | `[ ]` |
| 3.2 | 前端添加 ESLint + Prettier 配置 | `package.json` `.eslintrc` `.prettierrc` | `[ ]` |
| 3.3 | 将 `server/dist/` 加入 .gitignore | `.gitignore` `server/.gitignore` | `[x]` |
| 3.4 | 为 predictions / predictor / elo 补充单元测试 | `server/src/services/predictions.test.ts` `server/src/ai/predictor.test.ts` `server/src/domain/elo.test.ts` | `[ ]` |

### 涉及文件
- `server/src/index.ts`
- `server/.env.example`
- `.gitignore` / `server/.gitignore`
- `package.json`
- 新建测试文件

---

## 关键约束

- 前端当前为纯 JS（无 TypeScript），优化时保持风格一致，不强制迁移 TS
- Screens 拆分后需保持原有 `import` 路径对齐（App.jsx 中的 named imports）
- 后端 schema 变更（加 inputHash）需同步 `drizzle-kit push`
- N+1 优化需保持 `matchView()` 返回格式不变（前端直接消费）

## 已完成说明

- `1.1`：DataProvider 已拆成 core（teams/matches）与 players 两段加载；竞彩 tab 不触发 FIFA core 数据；球员 tab 与球队/球员详情按需加载 players；失败态提供重试按钮。
- `1.2`：API client 支持 `AbortSignal`；MatchDetailScreen 的 Elo/AI 预测请求会在切换比赛、卸载页面或重复触发 AI 分析时取消旧请求。
- `3.3`：已核对 `.gitignore` 与 `server/.gitignore` 均包含 `dist`，且 `git ls-files server/dist` 为空，当前无需额外改动。

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| — | — | — |
