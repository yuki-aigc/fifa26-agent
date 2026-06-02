/* ===========================================================
   FIFA26 预测系统 · 数据 + 胜率引擎
   window.WC = { teams, matches, odds(), score(), h2h() }
   =========================================================== */
(function () {
  // 球员: p(名, 位置, 号, 年龄, 俱乐部, [速度,射门,传球,防守,体能], 综合)
  const p = (name, pos, num, age, club, r, ovr) => ({
    name, pos, num, age, club,
    radar: { 速度: r[0], 射门: r[1], 传球: r[2], 防守: r[3], 体能: r[4] },
    ovr,
  });

  const teams = [
    {
      code: 'ARG', name: '阿根廷', en: 'Argentina', group: 'A', rank: 1,
      accent: '#6cace4',
      flag: 'linear-gradient(180deg,#75aadb 0 34%,#fff 34% 66%,#75aadb 66%)',
      ovr: 91, att: 90, mid: 89, def: 86, form: ['W', 'W', 'W', 'D', 'W'],
      titles: 3, note: '卫冕冠军 · 美洲杯冠军',
      squad: [
        p('梅西', 'FW', 10, 38, '迈阿密国际', [78, 92, 95, 38, 74], 90),
        p('劳塔罗', 'FW', 22, 28, '国际米兰', [86, 90, 78, 45, 88], 88),
        p('阿尔瓦雷斯', 'FW', 9, 26, '马德里竞技', [88, 87, 82, 50, 90], 87),
        p('德保罗', 'MF', 7, 31, '马德里竞技', [82, 76, 86, 78, 91], 85),
        p('麦卡利斯特', 'MF', 20, 27, '利物浦', [80, 80, 88, 80, 89], 86),
        p('罗梅罗', 'DF', 13, 28, '热刺', [79, 55, 74, 90, 86], 86),
        p('马丁内斯', 'GK', 23, 33, '阿斯顿维拉', [60, 30, 70, 88, 80], 87),
      ],
    },
    {
      code: 'FRA', name: '法国', en: 'France', group: 'C', rank: 2,
      accent: '#889df0',
      flag: 'linear-gradient(90deg,#0055a4 0 34%,#fff 34% 66%,#ef4135 66%)',
      ovr: 91, att: 91, mid: 88, def: 88, form: ['W', 'W', 'D', 'W', 'W'],
      titles: 2, note: '亚军 · 欧国联强队',
      squad: [
        p('姆巴佩', 'FW', 10, 27, '皇家马德里', [97, 92, 84, 40, 90], 91),
        p('登贝莱', 'FW', 11, 28, '巴黎圣日耳曼', [93, 84, 85, 45, 86], 86),
        p('格列兹曼', 'FW', 7, 35, '马德里竞技', [80, 86, 90, 62, 88], 86),
        p('琼阿梅尼', 'MF', 8, 26, '皇家马德里', [78, 72, 84, 86, 90], 86),
        p('拉比奥', 'MF', 14, 31, '马赛', [80, 78, 83, 80, 90], 84),
        p('库纳德', 'DF', 5, 26, '利物浦', [86, 52, 74, 88, 88], 85),
        p('迈尼昂', 'GK', 16, 30, 'AC米兰', [62, 32, 76, 86, 82], 86),
      ],
    },
    {
      code: 'BRA', name: '巴西', en: 'Brazil', group: 'E', rank: 5,
      accent: '#8ac68a',
      flag: 'radial-gradient(circle at 50% 50%,#ffdf00 0 34%,#009b3a 35%)',
      ovr: 89, att: 90, mid: 86, def: 84, form: ['W', 'D', 'W', 'W', 'L'],
      titles: 5, note: '五星巴西 · 桑巴军团',
      squad: [
        p('维尼修斯', 'FW', 7, 26, '皇家马德里', [96, 86, 82, 38, 88], 89),
        p('罗德里戈', 'FW', 11, 25, '皇家马德里', [92, 84, 84, 45, 86], 86),
        p('拉菲尼亚', 'FW', 19, 29, '巴塞罗那', [89, 86, 85, 52, 88], 87),
        p('帕奎塔', 'MF', 8, 28, '西汉姆', [80, 80, 88, 72, 86], 85),
        p('布鲁诺·吉马良斯', 'MF', 5, 28, '纽卡斯尔', [76, 74, 86, 84, 90], 86),
        p('马尔基尼奥斯', 'DF', 4, 31, '巴黎圣日耳曼', [78, 52, 78, 89, 85], 86),
        p('阿利松', 'GK', 1, 33, '利物浦', [58, 30, 74, 89, 80], 88),
      ],
    },
    {
      code: 'ENG', name: '英格兰', en: 'England', group: 'B', rank: 4,
      accent: '#f8a6b2',
      flag: 'linear-gradient(#cf142b,#cf142b) center/100% 24% no-repeat, linear-gradient(#cf142b,#cf142b) center/24% 100% no-repeat, #fff',
      ovr: 88, att: 88, mid: 86, def: 85, form: ['W', 'W', 'W', 'D', 'D'],
      titles: 1, note: '三狮军团 · 欧洲亚军',
      squad: [
        p('贝林厄姆', 'MF', 10, 22, '皇家马德里', [85, 86, 88, 76, 92], 89),
        p('凯恩', 'FW', 9, 32, '拜仁慕尼黑', [70, 92, 86, 48, 84], 89),
        p('福登', 'MF', 11, 25, '曼城', [86, 84, 89, 64, 86], 87),
        p('萨卡', 'FW', 7, 24, '阿森纳', [90, 84, 84, 55, 87], 86),
        p('赖斯', 'MF', 4, 27, '阿森纳', [78, 72, 84, 87, 90], 86),
        p('斯通斯', 'DF', 5, 31, '曼城', [74, 50, 82, 87, 84], 84),
        p('皮克福德', 'GK', 1, 31, '埃弗顿', [60, 30, 74, 85, 80], 84),
      ],
    },
    {
      code: 'ESP', name: '西班牙', en: 'Spain', group: 'D', rank: 3,
      accent: '#f7cd67',
      flag: 'linear-gradient(180deg,#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75%)',
      ovr: 88, att: 87, mid: 90, def: 84, form: ['W', 'W', 'W', 'W', 'D'],
      titles: 1, note: '欧洲杯冠军 · 传控大师',
      squad: [
        p('亚马尔', 'FW', 19, 18, '巴塞罗那', [92, 84, 88, 42, 84], 88),
        p('佩德里', 'MF', 8, 23, '巴塞罗那', [80, 76, 92, 72, 88], 87),
        p('加维', 'MF', 9, 21, '巴塞罗那', [82, 74, 86, 76, 90], 84),
        p('罗德里', 'MF', 16, 30, '曼城', [72, 80, 90, 88, 90], 90),
        p('尼科', 'FW', 17, 23, '毕尔巴鄂', [90, 80, 82, 55, 88], 84),
        p('库巴西', 'DF', 5, 19, '巴塞罗那', [78, 48, 80, 86, 84], 84),
        p('西蒙', 'GK', 23, 31, '毕尔巴鄂', [60, 30, 76, 85, 80], 85),
      ],
    },
    {
      code: 'POR', name: '葡萄牙', en: 'Portugal', group: 'F', rank: 6,
      accent: '#e59266',
      flag: 'linear-gradient(90deg,#006600 0 42%,#ff0000 42%)',
      ovr: 87, att: 89, mid: 86, def: 82, form: ['W', 'W', 'D', 'W', 'W'],
      titles: 0, note: '欧国联冠军',
      squad: [
        p('C罗', 'FW', 7, 41, '利雅得胜利', [76, 90, 78, 38, 80], 86),
        p('B费', 'MF', 8, 31, '曼联', [78, 86, 91, 70, 92], 88),
        p('莱奥', 'FW', 10, 26, 'AC米兰', [94, 84, 82, 42, 86], 86),
        p('B席', 'MF', 20, 31, '曼城', [82, 82, 90, 74, 90], 88),
        p('维蒂尼亚', 'MF', 16, 26, '巴黎圣日耳曼', [80, 78, 89, 76, 90], 86),
        p('迪亚斯', 'DF', 3, 28, '曼城', [76, 52, 80, 89, 86], 87),
      ],
    },
    {
      code: 'NED', name: '荷兰', en: 'Netherlands', group: 'G', rank: 7,
      accent: '#e18c6f',
      flag: 'linear-gradient(180deg,#ae1c28 0 34%,#fff 34% 66%,#21468b 66%)',
      ovr: 85, att: 85, mid: 84, def: 86, form: ['W', 'D', 'W', 'L', 'W'],
      titles: 0, note: '橙衣军团',
      squad: [
        p('范戴克', 'DF', 4, 34, '利物浦', [76, 58, 82, 92, 86], 88),
        p('加克波', 'FW', 11, 26, '利物浦', [86, 84, 84, 55, 88], 85),
        p('德容', 'MF', 21, 28, '巴塞罗那', [80, 72, 90, 80, 90], 86),
        p('西蒙斯', 'MF', 7, 22, '莱比锡', [88, 82, 86, 58, 86], 84),
        p('邓弗里斯', 'DF', 22, 29, '国际米兰', [88, 66, 78, 82, 92], 84),
      ],
    },
    {
      code: 'GER', name: '德国', en: 'Germany', group: 'H', rank: 9,
      accent: '#f7cd67',
      flag: 'linear-gradient(180deg,#000 0 34%,#dd0000 34% 66%,#ffce00 66%)',
      ovr: 85, att: 85, mid: 87, def: 82, form: ['W', 'W', 'L', 'W', 'D'],
      titles: 4, note: '日耳曼战车',
      squad: [
        p('维尔茨', 'MF', 17, 23, '利物浦', [86, 84, 90, 60, 88], 87),
        p('穆西亚拉', 'MF', 10, 23, '拜仁慕尼黑', [88, 84, 90, 58, 86], 87),
        p('基米希', 'MF', 6, 31, '拜仁慕尼黑', [76, 76, 90, 82, 90], 87),
        p('哈弗茨', 'FW', 7, 27, '阿森纳', [82, 84, 84, 60, 88], 84),
        p('吕迪格', 'DF', 2, 33, '皇家马德里', [82, 52, 76, 88, 86], 85),
      ],
    },
    {
      code: 'BEL', name: '比利时', en: 'Belgium', group: 'B', rank: 8,
      accent: '#fc736d',
      flag: 'linear-gradient(90deg,#000 0 34%,#fae042 34% 66%,#ed2939 66%)',
      ovr: 83, att: 85, mid: 84, def: 80, form: ['W', 'D', 'W', 'D', 'L'],
      titles: 0, note: '欧洲红魔',
      squad: [
        p('德布劳内', 'MF', 7, 34, '那不勒斯', [72, 86, 94, 64, 84], 87),
        p('卢卡库', 'FW', 9, 33, '那不勒斯', [78, 88, 76, 42, 82], 84),
        p('多库', 'FW', 22, 23, '曼城', [96, 78, 80, 48, 88], 84),
        p('蒂尔曼斯', 'MF', 8, 28, '马德里竞技', [74, 80, 86, 78, 88], 83),
      ],
    },
    {
      code: 'CRO', name: '克罗地亚', en: 'Croatia', group: 'D', rank: 10,
      accent: '#b77dee',
      flag: 'linear-gradient(180deg,#ff0000 0 34%,#fff 34% 66%,#171796 66%)',
      ovr: 82, att: 80, mid: 88, def: 80, form: ['D', 'W', 'D', 'W', 'L'],
      titles: 0, note: '格子军团 · 中场大师',
      squad: [
        p('莫德里奇', 'MF', 10, 40, 'AC米兰', [70, 78, 92, 70, 84], 84),
        p('科瓦契奇', 'MF', 8, 31, '曼城', [76, 74, 88, 80, 88], 84),
        p('格瓦迪奥尔', 'DF', 6, 24, '曼城', [86, 56, 80, 88, 90], 86),
        p('苏契奇', 'MF', 11, 23, '萨索洛', [78, 76, 84, 74, 88], 80),
      ],
    },
    {
      code: 'URU', name: '乌拉圭', en: 'Uruguay', group: 'E', rank: 11,
      accent: '#889df0',
      flag: 'linear-gradient(180deg,#fff 0 25%,#7b9fd4 25% 37%,#fff 37% 62%,#7b9fd4 62% 75%,#fff 75%)',
      ovr: 81, att: 82, mid: 80, def: 82, form: ['W', 'L', 'W', 'D', 'W'],
      titles: 2, note: '天蓝军团',
      squad: [
        p('努涅斯', 'FW', 9, 26, '利物浦', [92, 84, 74, 45, 90], 83),
        p('巴尔韦德', 'MF', 15, 27, '皇家马德里', [86, 82, 86, 82, 94], 88),
        p('阿劳霍', 'DF', 4, 27, '巴塞罗那', [88, 52, 74, 88, 90], 85),
        p('德拉克鲁斯', 'MF', 10, 28, '弗拉门戈', [78, 76, 84, 76, 88], 81),
      ],
    },
    {
      code: 'MAR', name: '摩洛哥', en: 'Morocco', group: 'F', rank: 12,
      accent: '#fc736d',
      flag: 'radial-gradient(circle at 50% 50%,#006233 0 16%,transparent 17%), #c1272d',
      ovr: 80, att: 80, mid: 82, def: 80, form: ['W', 'W', 'W', 'D', 'W'],
      titles: 0, note: '非洲之光 · 上届四强',
      squad: [
        p('哈基米', 'DF', 2, 27, '巴黎圣日耳曼', [92, 76, 82, 80, 92], 86),
        p('齐耶赫', 'MF', 7, 33, '加拉塔萨雷', [78, 82, 88, 60, 82], 83),
        p('阿玛拉', 'MF', 8, 26, '伯恩茅斯', [82, 78, 86, 78, 90], 84),
        p('恩内斯里', 'FW', 19, 31, '费内巴切', [80, 84, 74, 48, 84], 82),
      ],
    },
    {
      code: 'USA', name: '美国', en: 'USA', group: 'A', rank: 13,
      accent: '#889df0',
      flag: 'linear-gradient(#3c3b6e,#3c3b6e) top left/42% 54% no-repeat, repeating-linear-gradient(180deg,#b22234 0 14.3%,#fff 14.3% 28.6%)',
      ovr: 78, att: 79, mid: 78, def: 76, form: ['W', 'D', 'L', 'W', 'W'],
      titles: 0, note: '东道主之一',
      squad: [
        p('普利西奇', 'FW', 10, 27, 'AC米兰', [88, 82, 84, 52, 86], 84),
        p('麦肯尼', 'MF', 8, 27, '尤文图斯', [80, 76, 82, 78, 92], 82),
        p('巴洛贡', 'FW', 9, 24, '摩纳哥', [88, 80, 72, 44, 86], 79),
        p('亚当斯', 'MF', 4, 27, '伯恩茅斯', [82, 64, 78, 84, 92], 80),
      ],
    },
    {
      code: 'MEX', name: '墨西哥', en: 'Mexico', group: 'A', rank: 14,
      accent: '#8ac68a',
      flag: 'linear-gradient(90deg,#006847 0 34%,#fff 34% 66%,#ce1126 66%)',
      ovr: 77, att: 78, mid: 77, def: 76, form: ['W', 'W', 'D', 'L', 'D'],
      titles: 0, note: '东道主之一',
      squad: [
        p('希门尼斯', 'FW', 9, 25, '富勒姆', [82, 82, 74, 46, 86], 80),
        p('阿尔瓦雷斯', 'MF', 4, 28, '西汉姆', [76, 70, 82, 84, 90], 82),
        p('洛萨诺', 'FW', 22, 31, '圣迭戈', [90, 80, 78, 48, 84], 81),
        p('赫拉多', 'GK', 1, 33, '瓜达拉哈拉', [60, 30, 72, 82, 80], 80),
      ],
    },
    {
      code: 'JPN', name: '日本', en: 'Japan', group: 'C', rank: 15,
      accent: '#fc736d',
      flag: 'radial-gradient(circle at 50% 50%,#bc002d 0 28%,#fff 29%)',
      ovr: 78, att: 79, mid: 80, def: 75, form: ['W', 'W', 'W', 'W', 'D'],
      titles: 0, note: '蓝武士 · 亚洲领头羊',
      squad: [
        p('久保建英', 'FW', 11, 24, '皇家社会', [88, 80, 86, 55, 86], 84),
        p('三笘薰', 'FW', 8, 29, '布莱顿', [92, 80, 84, 52, 88], 84),
        p('远藤航', 'MF', 6, 33, '利物浦', [74, 70, 82, 84, 90], 82),
        p('堂安律', 'MF', 14, 27, '弗赖堡', [84, 80, 84, 60, 88], 81),
      ],
    },
    {
      code: 'KOR', name: '韩国', en: 'Korea', group: 'G', rank: 16,
      accent: '#889df0',
      flag: 'radial-gradient(circle at 50% 50%,#cd2e3a 0 20%,#0047a0 20% 30%,#fff 31%)',
      ovr: 77, att: 80, mid: 77, def: 74, form: ['W', 'D', 'W', 'L', 'W'],
      titles: 0, note: '太极虎',
      squad: [
        p('孙兴慜', 'FW', 7, 33, '洛杉矶FC', [90, 88, 84, 50, 88], 86),
        p('李刚仁', 'MF', 18, 25, '巴黎圣日耳曼', [82, 80, 86, 58, 86], 82),
        p('金玟哉', 'DF', 3, 29, '拜仁慕尼黑', [80, 52, 76, 87, 88], 84),
        p('黄喜灿', 'FW', 11, 30, '马赛', [88, 78, 76, 55, 90], 80),
      ],
    },
  ];

  const byCode = Object.fromEntries(teams.map((t) => [t.code, t]));

  // 赛程 (小组赛 + 淘汰赛样例)
  const matches = [
    { id: 'm1', a: 'ARG', b: 'USA', stage: '小组赛 A组', venue: '纽约/新泽西', day: '6月12日', time: '20:00', live: false },
    { id: 'm2', a: 'FRA', b: 'JPN', stage: '小组赛 C组', venue: '洛杉矶', day: '6月13日', time: '17:00', live: false },
    { id: 'm3', a: 'BRA', b: 'URU', stage: '小组赛 E组', venue: '迈阿密', day: '6月13日', time: '20:00', live: true },
    { id: 'm4', a: 'ESP', b: 'CRO', stage: '小组赛 D组', venue: '达拉斯', day: '6月14日', time: '18:00', live: false },
    { id: 'm5', a: 'ENG', b: 'BEL', stage: '小组赛 B组', venue: '波士顿', day: '6月14日', time: '21:00', live: false },
    { id: 'm6', a: 'POR', b: 'MAR', stage: '小组赛 F组', venue: '多伦多', day: '6月15日', time: '16:00', live: false },
    { id: 'm7', a: 'NED', b: 'KOR', stage: '小组赛 G组', venue: '温哥华', day: '6月15日', time: '19:00', live: false },
    { id: 'm8', a: 'GER', b: 'MEX', stage: '小组赛 H组', venue: '墨西哥城', day: '6月16日', time: '20:00', live: false },
  ];

  // ===== 胜率引擎 =====
  // Elo 逻辑模型: 由综合实力差推导胜/平/负
  function odds(aCode, bCode) {
    const A = byCode[aCode], B = byCode[bCode];
    // 加入攻防与状态的微调
    const formScore = (t) => t.form.reduce((s, r) => s + (r === 'W' ? 2 : r === 'D' ? 1 : 0), 0); // 0-10
    const sA = A.ovr + (A.att - B.def) * 0.12 + (formScore(A) - 5) * 0.5;
    const sB = B.ovr + (B.att - A.def) * 0.12 + (formScore(B) - 5) * 0.5;
    const exp = 1 / (1 + Math.pow(10, (sB - sA) / 11)); // A 的净胜望
    // 平局概率: 实力越接近越高
    let drawP = 0.30 - 0.42 * Math.abs(exp - 0.5);
    drawP = Math.max(0.12, Math.min(0.31, drawP));
    const rem = 1 - drawP;
    let win = rem * exp, loss = rem * (1 - exp);
    // 百分比取整且和为 100
    let w = Math.round(win * 100), d = Math.round(drawP * 100);
    let l = 100 - w - d;
    if (l < 0) { d += l; l = 0; }
    return { win: w, draw: d, loss: l };
  }

  // 预测比分
  function score(aCode, bCode) {
    const A = byCode[aCode], B = byCode[bCode];
    const xg = (att, def) => 0.55 + ((att + (100 - def)) / 100) * 1.55;
    let gA = xg(A.att, B.def), gB = xg(B.att, A.def);
    let rA = Math.round(gA), rB = Math.round(gB);
    const o = odds(aCode, bCode);
    // 与胜率方向对齐
    if (o.win > o.loss && rA <= rB) rA = rB + 1;
    if (o.loss > o.win && rB <= rA) rB = rA + 1;
    if (o.win === o.loss && rA !== rB) rB = rA;
    return { a: rA, b: rB, xgA: gA.toFixed(1), xgB: gB.toFixed(1) };
  }

  // 历史交锋 (由队代码确定性生成)
  function h2h(aCode, bCode) {
    let seed = (aCode + bCode).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const total = 5 + Math.floor(rnd() * 6);
    const A = byCode[aCode], B = byCode[bCode];
    let aw = 0, dr = 0, bw = 0;
    const bias = (A.ovr - B.ovr) / 30;
    for (let i = 0; i < total; i++) {
      const r = rnd() + bias;
      if (r > 0.62) aw++; else if (r < 0.34) bw++; else dr++;
    }
    return { total, aw, dr, bw };
  }

  // 关键因素 (用于详情页解读)
  function factors(aCode, bCode) {
    const A = byCode[aCode], B = byCode[bCode];
    const f = [];
    const cmp = (label, va, vb, unit = '') => f.push({ label, a: va + unit, b: vb + unit, lead: va === vb ? 0 : (va > vb ? 1 : -1), pa: va, pb: vb });
    cmp('综合实力', A.ovr, B.ovr);
    cmp('进攻', A.att, B.att);
    cmp('中场', A.mid, B.mid);
    cmp('防守', A.def, B.def);
    const fs = (t) => t.form.reduce((s, r) => s + (r === 'W' ? 2 : r === 'D' ? 1 : 0), 0);
    cmp('近期状态', fs(A), fs(B), '/10');
    cmp('世界排名', B.rank, A.rank); // 排名小更好,反向比较使 lead 语义正确
    f[f.length - 1] = { label: '世界排名', a: '#' + A.rank, b: '#' + B.rank, lead: A.rank === B.rank ? 0 : (A.rank < B.rank ? 1 : -1), pa: 100 - A.rank, pb: 100 - B.rank };
    return f;
  }

  window.WC = { teams, byCode, matches, odds, score, h2h, factors };
})();
