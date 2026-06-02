# FIFA26 预测系统

手机端的 FIFA26比赛预测系统，延续 **animal-island-ui**（动物之森风）的活泼游戏化视觉：暖羊皮纸背景、薄荷绿主色、任天堂式 3D 按钮阴影、圆润 pill 形状、Nunito + Noto Sans SC 字体、叶子图标。

由 [Claude Design](https://claude.ai/design) 的 HTML/CSS/JS 原型实现为真正的 **React + Vite** 应用,**数据与预测来自 `server/` 后端 API**(原 mock 数据已下线)。

## 功能

底部 pill 导航三大模块,数据全部来自后端:

- **赛程** — 今日焦点大卡 + 全场赛程(真实 104 场,种子后 72 场已定对阵),每场带客户端 Elo 即时算出的胜/平/负概率条 → 点进**单场预测详情**(调后端 `/prediction`:预测比分、置信度、实力对比、历史交锋,并可一键 **🤖 AI 深度预测**)
- **球队** — 48 强实力榜 → **球队详情**(综合评分、攻/中/防数据条、近 5 场战绩、阵容)
- **球员** — 球星库(可按位置筛选)→ **球员详情**,含**五边形雷达图**:速度 · 射门 · 传球 · 防守 · 体能

胜率有两层:列表用客户端 Elo 即时估算;详情页调用后端,默认返回 Elo 基线,点 **AI 深度预测** 时由后端 `pi` 调用大模型给出结构化预测 + 中文分析(无 AI 密钥时自动回退 Elo)。

## 运行(需同时启动后端)

```bash
# 1) 后端 (端口 8787) — 详见 server/README.md
cd server && pnpm install && pnpm db:push && pnpm seed && pnpm dev

# 2) 前端 (另开终端)
npm install
npm run dev      # http://localhost:5173
```

前端通过 `VITE_API_BASE` 找后端(默认 `http://localhost:8787`,见 `.env.example`)。后端未启动时,首屏会显示“无法连接后端”的提示。

```bash
npm run build    # 生产构建到 dist/
npm run preview  # 预览生产构建
```

## 结构

```
index.html
src/
  main.jsx              入口 (挂载 App)
  App.jsx               DataProvider + 导航栈 + 底部 Tab + 加载/错误态
  styles.css            设计系统 (token / 卡片 / 按钮 / 概率条 / 雷达样式)
  data/
    api.js              后端 API 客户端 (VITE_API_BASE)
    store.jsx           DataProvider / useData — 启动时加载 teams/matches/players
    elo.js              客户端 Elo (赛程列表即时概率条)
  components/ui.jsx     UI 基础组件 (FlagBadge=emoji 旗帜 / StatBar / ProbBar / Radar …)
  screens/Screens.jsx   六个屏幕 (详情页调后端预测,含 AI 切换)
  assets/               图标与装饰素材
```

> 后端在 `server/`(Fastify + Drizzle/SQLite + pi AI)。原始设计交接包位于 `design_extracted/`(仅参考,不参与构建)。
