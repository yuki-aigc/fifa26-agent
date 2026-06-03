# FIFA26-Agent 代码审查发现

> 仅存储研究发现，不存储外部不可信内容。

## 前端架构发现

### store.jsx 数据加载
- **位置：** `src/data/store.jsx:23`
- **状态：** 已修复
- **原问题：** 启动时 `Promise.all([teams(), matches(), players()])` 全量加载；竞彩 tab 完全用不到 FIFA core 数据；失败后无重试入口
- **处理：** `src/data/store.jsx` 拆为 core（teams/matches）与 players 两段加载，`src/App.jsx` 按 tab/详情页触发加载，并在错误态提供重试按钮

### fetch 无 AbortController
- **位置：** `src/screens/Screens.jsx:153-162`
- **状态：** 已修复
- **原问题：** `let alive = true` 只防 setState，底层 fetch 没有 abort
- **处理：** `src/data/api.js` 支持 `AbortSignal`，`MatchDetailScreen` 在切换比赛、卸载页面或重复触发 AI 分析时取消旧请求

### 内联样式性能
- **位置：** `src/screens/Screens.jsx` 全文
- **问题：** 每次 render 重建大量 style 对象，列表 map 中尤其浪费
- **方案：** 高频样式提取到 styles.css（已有 CSS token 但屏幕组件未使用）

### App.jsx 路由
- **位置：** `src/App.jsx:80-110`
- **问题：** if/else 赋值 title/sub/content，新增屏幕要改 5 处
- **方案：** screens map（tab → {title, sub, component}）

### StatusBar 定时器
- **位置：** `src/App.jsx:21`
- **问题：** `setInterval(tick, 1000)` 每秒触发，精度远超显示需求（HH:MM）
- **方案：** 改为对齐下一分钟触发，或 30s interval

## 后端架构发现

### N+1 查询
- **位置：** `server/src/routes/index.ts:92-99`
- **问题：** `/api/matches` 对每场 `await getMatchWithTeams(m.id)`，每场 3 次查询
- **影响：** 72 场 ≈ 216 次串行 SQLite 查询
- **方案：** 单次 `SELECT matches JOIN teams AS home JOIN teams AS away`

### AI 缓存键
- **位置：** `server/src/services/predictions.ts:79`
- **问题：** 缓存键 `(matchId, engine, model)`，输入数据（伤病/赔率）变化时不失效
- **方案：** 加 `inputHash` 字段（对关键输入 JSON.stringify + hash）

### AI 可观测性
- **位置：** `server/src/ai/predictor.ts:92-95`
- **问题：** 失败只 `console.warn`，无 trackError/metrics 记录
- **影响：** 无法统计 AI 调用成功率、延迟、token 消耗
- **方案：** 接入已有 `trackError` + `recordHttpRequest` 或新增 AI 专用 metric

### 双 Elo 实现
- **位置：** `src/data/elo.js` vs `server/src/domain/elo.ts`
- **问题：** 两套独立实现，赛程列表用前者、详情用后者，容易漂移
- **方案选项 A：** 后端 `/api/matches?withOdds=1` 顺带返回 Elo 概率
- **方案选项 B：** 抽为共享 JS 模块（monorepo 或复制保持一致）

## 工程化发现

### CORS 配置
- **位置：** `server/src/index.ts:22`
- `origin: true` 接受所有跨域来源
- **方案：** `CORS_ORIGIN` env 变量，默认 `http://localhost:5173`

### dist/ 忽略状态
- 已确认 `git ls-files server/dist` 为空，当前没有跟踪 `server/dist/` 编译产物
- `.gitignore` 和 `server/.gitignore` 均已包含 `dist`

### 缺失测试
- `predictions.ts` / `predictor.ts` / `elo.ts` 无测试
- 现有测试：`routes/index.test.ts`、`lotteryAnalysis.test.ts`、`metrics.test.ts`、`alerts.test.ts`
