# 竞猜足彩视角差距分析与功能补全规划

## 问题陈述

项目当前已具备「世界杯预测 App」的骨架（Elo 基线 + AI 胜平负/比分预测 + 竞彩赔率展示 + AI 竞彩建议），但从**真正辅助竞彩投注决策**的角度看，缺少概率模型、价值判断（EV）、建议闭环验证（ROI）和多维数据，AI 建议目前更像「资讯解读」而非「可验证的投注策略」。

## 基线现状（优化前）

- **数据层**：`server/src/db/schema.ts` 有 teams / players / matches / matchStats(xG) / injuries / odds(仅 1X2) / predictions(含对账字段) / h2h。
- **模型层**：`server/src/domain/elo.ts` 仅 Elo 胜平负 + 单一预测比分；AI 预测（`ai/predictor.ts`）以 Elo + 市场隐含概率为先验。
- **竞彩链路**：`ingest/sources/firoApi.ts` 接入竞彩官方赔率（HAD/HHAD 已结构化，HAFU/TTG/CRS 为 `unknown[]`）；`services/lotteryAnalysis.ts` 把赔率+情报喂给 LLM 产出建议，但**结果不落库**；`/api/lottery/*` 每次实时直连 Firo。
- **对账层**：`services/accuracy.ts` 只对 FIFA26 赛程的胜平负/比分命中率打分，竞彩建议完全没有验证机制。
- **同步层**：`ingest/firoSync.ts` 只把 HAD 最新一条写入本地 odds 表；`scheduler.ts` 的定时任务不包含 firoSync。

## 差距分析（按重要性排序）

### 1. 竞彩建议没有闭环——最大缺口

- `analyzeLotteryMatch` 的 suggestions/recommendation/confidence 没有持久化，比赛结束后无法回答「AI 推荐命中率多少、按建议投注 ROI 是多少」。
- 没有建议 → 开奖结果 → 盈亏的对账流水，系统可信度无法积累，也无法对比不同模型/提示词的效果。

### 2. 缺少比分分布模型，无法覆盖竞彩玩法

- 竞彩五大玩法（胜平负/让球/比分/总进球/半全场）中，自有模型只能输出胜平负。让球、总进球、比分、半全场需要**泊松/Dixon-Coles 比分分布模型**才能给出每个选项的概率。
- 没有自有概率，就无法和赔率比较，AI 只能凭语感给建议（当前 prompt 即是如此）。

### 3. 没有价值投注（Value Betting）能力

- 缺「模型概率 vs 赔率隐含概率」的 EV 计算：`EV = p_model × odds − 1`。
- 缺凯利公式仓位建议、缺每日全场次 value 扫描（批量找出被高估/低估的选项）。
- `odds.ts` 已有去水隐含概率，但只用作 AI 先验，没有反向用于价值判断。

### 4. 赔率数据深度不足

- HAFU/TTG/CRS 赔率历史未结构化（`firoApi.ts:159-161`），比分玩法的全部 31 个选项赔率拿不到结构化数据。
- 本地 odds 表只存 1X2，不存让球线（goalLine）、不存其他玩法 → 无法做赔率走势回测。
- 喂给 AI 的走势只取最近 3 条（`lotteryAnalysis.ts:39`），缺初盘→即时盘变化幅度、临场异动检测、变盘次数等走势特征。
- 单一数据源（竞彩官方），缺欧赔多家对比（Pinnacle 等市场基准）、亚盘水位、凯利指数、离散度——这些是足彩分析的核心参照系。

### 5. 情报维度缺口

- 首发阵容确认（赛前 1 小时）、天气/场地、裁判尺度、世界杯特有因素：美加墨三国长途飞行与时差、丹佛/墨西哥城高海拔、小组末轮出线形势（默契球/轮换风险）。
- 伤停只有名单，没有「缺阵球员重要度」量化（可用 players 表 ovr 加权）。
- matchStats 有 xG 字段但模型未使用 xG 修正进攻/防守强度。

### 6. 串关与投注组合功能缺失

- 无过关（串关）组合 EV/方差计算、无奖金计算器、无「2串1/3串1 最优组合推荐」。
- 无模拟投注账本（虚拟本金、按建议自动下注、盈亏曲线），这是验证系统价值最直观的方式。

### 7. 模型评估只有命中率

- `accuracy.ts` 只算 outcome/score 命中率，缺 **Brier Score、对数损失、校准曲线**（预测 70% 的场次实际赢了多少）；命中率高不代表赔付后赚钱。

### 8. 工程基础

- `/api/lottery/*` 每次实时打 Firo（list+info+odds 三连），无缓存无限频保护，分析接口延迟高、易触发配额。
- 竞彩赛程/赔率/情报不落库，无历史快照 → 一切回测都做不了。
- scheduler 不调度 firoSync，竞彩赔率快照靠手动 CLI。

## 国内竞彩玩法与购买策略设计（产品核心导向）

功能上应围绕**中国体彩竞彩的实际玩法规则**输出「怎么买」的可执行建议，而不是只给胜平负判断。

### 玩法约束（建议引擎必须感知）

- **胜平负 HAD / 让球胜平负 HHAD**：主流玩法，多数场次支持单关（`cbtSingle=1`）。
- **比分 CRS**（31 选项）、**总进球 TTG**（0-7+）、**半全场 HAFU**（9 选项）：高赔玩法，通常**不支持单关、必须串关过关**——建议引擎必须读取 `matchPoolList` 的单关/过关标志，避免给出无法购买的注单。
- 竞彩为**固定赔率**且含官方抽水（返还率约 70%+），策略上必须用去水概率算 EV，跑赢抽水才有长期价值。

### 策略分层（AI 建议按三档输出）

1. **稳健型（保本优先）**
   - 选高置信、低赔选项：模型概率 ≥ 65% 且 EV ≥ 0 的胜平负/让球单关。
   - 双选保险：用「胜平负 + 让球」对冲（如主胜信心不足时买 HHAD 受让方双选），或平/胜双选拆注。
   - 仓位：凯利分数的 1/4（quarter-Kelly），单场不超过本金 5%。
2. **均衡型（价值优先）**
   - 每日 value 扫描出的 EV 最高选项（不限玩法），中等赔率（2.0-3.5）。
   - 2 串 1 优先：两场各自 EV>0 且相关性低的稳健选项串联放大收益。
3. **博胆型（搏高赔）**
   - 低概率但 EV 显著为正的冷门：冷平（赔率 ≥ 3.5 的平局）、准确比分、半全场反转项。
   - 比分玩法用「比分分布 Top3 + 防冷拆注」的小额组合，单注金额 ≤ 本金 1%。
   - 明确标注「娱乐仓」，与稳健仓资金隔离。

### 产品形态

- AI 分析结果从当前的自由建议升级为结构化**注单建议**：`{玩法, 选项, 赔率, 模型概率, EV, 档位(稳健/均衡/博胆), 建议注数比例, 单关或串关方式}`。
- 每日输出「今日竞彩推荐单」：稳健 1-2 单 + 均衡 2 串 1 一组 + 博胆小注若干，附奖金计算。
- 每条注单进入对账流水，按档位分别统计命中率与 ROI，让用户看到「稳健档长期 ROI vs 博胆档长期 ROI」。

## 提议的改动（分四期）

### Phase 1 — 数据落库与建议闭环（先把地基打牢）

1. 新增表：`lottery_matches`（Firo 赛程快照）、`lottery_odds_snapshots`（全玩法赔率时序，含 goalLine/poolCode）、`lottery_analyses`（AI 建议持久化 + 对账字段：每条 suggestion 的命中与按 1 注计算的盈亏）。
2. firoSync 扩展：结构化解析 HAFU/TTG/CRS 赔率历史；竞彩数据定时落库（纳入 scheduler，独立开关与频率）。
3. 竞彩对账服务：开奖后回填建议命中/盈亏，新增 `/api/lottery/accuracy`（命中率 + ROI 按模型/玩法/策略档位聚合）。
4. `/api/lottery/*` 增加本地缓存（DB 优先 + TTL 内存缓存），降低 Firo 依赖。

### Phase 1 实施状态（2026-06-12）

已完成：

1. **竞彩数据表已落库**
   - 已新增 `lottery_matches`：保存 Firo 世界杯竞彩赛程快照，包含 Firo matchId、本地 matchId、联赛/队名/开赛时间、销售状态、玩法状态 JSON、原始 raw JSON、更新时间。
   - 已新增 `lottery_odds_snapshots`：保存全玩法赔率时序，包含 poolCode、optionCode、optionLabel、odds、goalLine、updateTime、capturedAt、source、raw JSON，并按 `(firoMatchId,poolCode,optionCode,goalLine,updateTime)` 去重。
   - 已新增 `lottery_analyses`：保存每次 AI 竞彩分析，包含 provider/model、recommendation/confidence/reasoning、raw JSON、createdAt、gradedAt、roiOneUnit。
   - 已新增 `lottery_picks`：保存结构化注单建议明细，包含 tier、poolCode、optionCode、optionLabel、odds、modelProbability、ev、stakeFraction、isHit、profitOneUnit。
   - 已执行 `pnpm --dir server db:push` 更新本地 SQLite。

2. **Firo 同步已扩展为世界杯竞彩落库**
   - 已复用世界杯过滤逻辑，只落库能映射到本地世界杯赛程的场次。
   - `firoSync` 已同步 `soccer-events`、`all-list` 和 `odds` 历史接口数据。
   - HAD/HHAD 已结构化入 `lottery_odds_snapshots`；HAFU/TTG/CRS 已做保守解析，能识别的 option/odds/updateTime 入结构化字段，不能稳定识别的保留 raw JSON，不阻塞同步。
   - 单日或单接口失败不会终止整批同步，会记录失败日期并继续。
   - CLI 已保留 `pnpm --dir server sync:firo -- --days=N`，并新增 `--date=YYYY-MM-DD`、`--refresh-details`。

3. **竞彩 API 已改为 DB 优先**
   - `/api/lottery/matches`：DB 有快照时优先返回本地数据；DB 无数据或 `refresh=1` 时才请求 Firo 并落库。
   - `/api/lottery/matches/:id`：DB 返回赛程、最新全玩法赔率历史摘要；Firo 可用时刷新详情和赔率，Firo 失败时降级返回本地数据。
   - `/api/lottery/matches/:id/analysis`：AI 结果已落 `lottery_analyses`，结构化 picks 已落 `lottery_picks`，旧字段 `suggestions/recommendation/confidence/reasoning` 保持兼容。
   - `/api/lottery/matches/:id/analysis/stream`：流式分析完成后同样会持久化分析结果和 picks。
   - 已新增 `/api/lottery/accuracy`：按 provider/model、玩法、档位聚合 graded 数、命中数、命中率、profit、ROI。

4. **调度与配置已补齐**
   - 已新增 `FIRO_SYNC_ENABLED`、`FIRO_SYNC_INTERVAL_MIN`、`FIRO_SYNC_DAYS`。
   - `scheduler.ts` 已支持 API-Football sync 与 Firo sync 独立运行，各自防重入，互不阻塞。

5. **AI 建议结构已升级**
   - `submit_lottery_analysis` 工具 schema 已支持结构化 `picks`。
   - 每条 pick 要求 `tier`、`poolCode`、`optionLabel`、`reason`。
   - `odds/modelProbability/ev/stakeFraction` 允许为 `null`，Phase 1 先预留字段，不强行实现 EV。
   - 兼容旧格式：没有 picks 时继续使用旧 `suggestions`；有 picks 但没有 suggestions 时自动派生旧字段。

6. **最小对账闭环已实现**
   - HAD、HHAD、TTG、CRS 可根据本地最终比分自动判定。
   - `profitOneUnit = hit ? odds - 1 : -1`，analysis 级别 ROI 会按已对账 picks 回填。
   - HAFU 因本地目前没有半场比分，暂保持未对账状态。

7. **验证与同步结果**
   - 已新增测试覆盖 Firo 赔率解析、重复 upsert 去重、AI 新旧格式解析、ROI 命中判定、DB-first 路由、accuracy 空数据稳定结构。
   - 已通过：`pnpm --dir server test`、`pnpm test`、`pnpm --dir server build`、`pnpm build`、`git diff --check`。
   - 2026-06-12 09:25 CST 手动执行 `pnpm --dir server sync:firo -- --days=3 --refresh-details` 成功。
   - 当前本地库结果：`lottery_matches` 12 场，全部映射到本地世界杯赛程；非世界杯计数 0；`lottery_odds_snapshots` 2035 条，其中 CRS 1395、HAD 99、HAFU 261、HHAD 120、TTG 160。

仍未完成或留到后续 Phase：

1. `/api/lottery/*` 已做到 DB 优先和 Firo 兜底，但还没有额外增加 TTL 内存缓存层。
2. EV、凯利仓位、每日 value 扫描仍属于 Phase 2，当前仅预留字段。
3. HAFU 自动对账需要半场比分数据后才能稳定启用。
4. 本轮不新增前端页面；现有竞彩页保持兼容。

### Phase 2 — 概率模型升级（让系统自己会算）

1. 在 `domain/` 新增泊松/Dixon-Coles 比分分布模型：由 Elo 期望进球（或 xG 修正）推导每个比分的概率，进而派生让球/总进球/半全场/比分各选项概率。
2. 新增 EV/凯利服务：对每场每个在售选项计算 `模型概率 × 赔率 − 1` 与建议仓位，输出 value 排序。
3. 新增 `/api/lottery/matches/:id/value` 与每日全场次扫描 `/api/lottery/value-scan`。
4. AI prompt 升级：把模型各玩法概率 + EV 表 + 玩法单关/串关约束作为强先验喂给 LLM，让 AI 按「稳健/均衡/博胆」三档输出结构化注单建议。

### Phase 3 — 数据增强

1. 走势特征工程：初盘 vs 即时盘变化幅度、变盘方向/次数、临场异动标记，作为结构化字段入 prompt。
2. 首发阵容确认同步（API-Football lineups）+ 缺阵球员重要度量化（按 ovr/位置加权扣分）。
3. 世界杯情境因子：休息天数（已有）、飞行距离/时差、海拔、小组出线形势（可由 standings 推导）。
4. （可选，视数据源）欧赔多家对比与竞彩水位差分析。

### Phase 4 — 产品功能

1. 串关优化器：给定候选场次，枚举 2-3 串 1 组合按 EV/方差排序 + 奖金计算器（遵守玩法过关限制）。
2. 模拟投注账本：虚拟本金按建议自动下注（按档位分仓），输出盈亏曲线与 ROI，前端新增「战绩」页。
3. 模型评估升级：accuracy 增加 Brier Score / 对数损失 / 校准分桶，前端展示系统可信度。

## 验证方式

- 单测：泊松派生概率归一性、EV/凯利计算、HAFU/TTG/CRS 解析（沿用现有 vitest 风格，如 `lotteryAnalysis.test.ts`）。
- 回测：用落库的赔率快照 + 开奖结果跑历史 ROI，对比「全买主胜」「跟随赔率热门」基线，并分「稳健/均衡/博胆」三档分别统计。
- 现有 `pnpm test` 与 `/api/metrics` 观测链路保持兼容。
