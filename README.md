# 世界杯2026 预测系统

手机端的 2026 世界杯比赛预测系统，延续 **animal-island-ui**（动物之森风）的活泼游戏化视觉：暖羊皮纸背景、薄荷绿主色、任天堂式 3D 按钮阴影、圆润 pill 形状、Nunito + Noto Sans SC 字体、叶子图标。

由 [Claude Design](https://claude.ai/design) 的 HTML/CSS/JS 原型实现为真正的 **React + Vite** 应用。

## 功能

底部 pill 导航三大模块：

- **赛程** — 今日焦点大卡 + 全场赛程，每场带系统自动算出的胜/平/负概率条 → 点进**单场预测详情**（预测比分、置信度、实力对比双向条、历史交锋）
- **球队** — 实力榜网格 → **球队详情**（综合评分、攻/中/防数据条、近 5 场战绩、阵容）
- **球员** — 球星库（可按位置筛选）→ **球员详情**，含**五边形雷达图**：速度 · 射门 · 传球 · 防守 · 体能

**胜率引擎是真算的**：基于球队实力 + 攻防 + 近期状态，用 Elo 逻辑模型推导胜/平/负概率与预测比分（见 `src/data/wc.js`），并非随机数。当前覆盖 16 强、每队 4–7 名球员；数据为按 2026 实力做的合理估值，可替换为真实数据源。

## 开发

```bash
npm install
npm run dev      # 本地开发服务器 http://localhost:5173
npm run build    # 生产构建到 dist/
npm run preview  # 预览生产构建
```

## 结构

```
index.html
src/
  main.jsx              入口
  App.jsx               根组件：导航栈 + 底部 Tab + 状态栏
  styles.css            设计系统 (token / 卡片 / 按钮 / 概率条 / 雷达样式)
  data/wc.js            球队/球员数据 + 胜率引擎 (odds / score / h2h / factors)
  components/ui.jsx     UI 基础组件 (FlagBadge / StatBar / ProbBar / FormDots / Radar / SecH / Header / OvrBadge)
  screens/Screens.jsx   六个屏幕
  assets/               图标与装饰素材
```

> 原始设计交接包位于 `design_extracted/`（HTML/CSS/JS 原型，仅作参考，不参与构建）。
