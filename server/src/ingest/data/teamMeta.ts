/* ===========================================================
   球队元数据 (策展) · 48 队
   身份/分组/旗帜/赛程来自 OpenFootball; 此处补充中文名 + 实力评估。
   实力为按 2026 年中状态做的合理估值, 可被 FC26 阵容数据 / API-Football 覆盖。
   键 = FIFA 三字码 (与 OpenFootball fifa_code 对齐)。
   =========================================================== */
export interface TeamMeta {
  zh: string;
  accent: string;
  rank: number;
  points: number;
  ovr: number;
  att: number;
  mid: number;
  def: number;
  titles: number;
  note: string;
  form: string[];
}

type Form = string[];
const F = (s: string): Form => s.split(''); // "WWDWL" -> ['W','W','D','W','L']

export const TEAM_META: Record<string, TeamMeta> = {
  // ── Elite ──
  ARG: { zh: '阿根廷', accent: '#6cace4', rank: 1, points: 1885, ovr: 91, att: 90, mid: 89, def: 86, titles: 3, note: '卫冕冠军 · 美洲杯冠军', form: F('WWWDW') },
  FRA: { zh: '法国', accent: '#889df0', rank: 2, points: 1862, ovr: 91, att: 91, mid: 88, def: 88, titles: 2, note: '亚军 · 欧国联强队', form: F('WWDWW') },
  ESP: { zh: '西班牙', accent: '#f7cd67', rank: 3, points: 1854, ovr: 88, att: 87, mid: 90, def: 84, titles: 1, note: '欧洲杯冠军 · 传控大师', form: F('WWWWD') },
  ENG: { zh: '英格兰', accent: '#f8a6b2', rank: 4, points: 1820, ovr: 88, att: 88, mid: 86, def: 85, titles: 1, note: '三狮军团 · 欧洲亚军', form: F('WWWDD') },
  BRA: { zh: '巴西', accent: '#8ac68a', rank: 5, points: 1789, ovr: 89, att: 90, mid: 86, def: 84, titles: 5, note: '五星巴西 · 桑巴军团', form: F('WDWWL') },
  POR: { zh: '葡萄牙', accent: '#e59266', rank: 6, points: 1772, ovr: 87, att: 89, mid: 86, def: 82, titles: 0, note: '欧国联冠军', form: F('WWDWW') },
  // ── Strong ──
  NED: { zh: '荷兰', accent: '#e18c6f', rank: 7, points: 1745, ovr: 85, att: 85, mid: 84, def: 86, titles: 0, note: '橙衣军团', form: F('WDWLW') },
  BEL: { zh: '比利时', accent: '#fc736d', rank: 8, points: 1730, ovr: 83, att: 85, mid: 84, def: 80, titles: 0, note: '欧洲红魔', form: F('WDWDL') },
  GER: { zh: '德国', accent: '#f7cd67', rank: 9, points: 1718, ovr: 85, att: 85, mid: 87, def: 82, titles: 4, note: '日耳曼战车 · 东道主无关', form: F('WWLWD') },
  CRO: { zh: '克罗地亚', accent: '#b77dee', rank: 10, points: 1702, ovr: 82, att: 80, mid: 88, def: 80, titles: 0, note: '格子军团 · 中场大师', form: F('DWDWL') },
  URU: { zh: '乌拉圭', accent: '#7b9fd4', rank: 11, points: 1690, ovr: 84, att: 84, mid: 82, def: 83, titles: 2, note: '天蓝军团', form: F('WLWDW') },
  COL: { zh: '哥伦比亚', accent: '#f5d33a', rank: 12, points: 1675, ovr: 83, att: 84, mid: 83, def: 80, titles: 0, note: '南美劲旅 · 不败之师', form: F('WWDWW') },
  MAR: { zh: '摩洛哥', accent: '#c1272d', rank: 13, points: 1665, ovr: 82, att: 81, mid: 82, def: 83, titles: 0, note: '非洲之光 · 上届四强', form: F('WWWDW') },
  JPN: { zh: '日本', accent: '#bc002d', rank: 14, points: 1652, ovr: 80, att: 80, mid: 82, def: 76, titles: 0, note: '蓝武士 · 亚洲领头羊', form: F('WWWWD') },
  SEN: { zh: '塞内加尔', accent: '#00853f', rank: 15, points: 1640, ovr: 81, att: 82, mid: 79, def: 81, titles: 0, note: '特兰加雄狮', form: F('WWDWL') },
  // ── Good ──
  SUI: { zh: '瑞士', accent: '#d52b1e', rank: 16, points: 1625, ovr: 80, att: 78, mid: 80, def: 82, titles: 0, note: '稳健红十字', form: F('DWDWW') },
  USA: { zh: '美国', accent: '#3c3b6e', rank: 17, points: 1610, ovr: 79, att: 79, mid: 78, def: 76, titles: 0, note: '东道主之一', form: F('WDLWW') },
  MEX: { zh: '墨西哥', accent: '#006847', rank: 18, points: 1602, ovr: 78, att: 78, mid: 77, def: 76, titles: 0, note: '东道主 · 揭幕战', form: F('WWDLD') },
  ECU: { zh: '厄瓜多尔', accent: '#ffd100', rank: 19, points: 1590, ovr: 79, att: 77, mid: 78, def: 82, titles: 0, note: '南美黑马 · 铁血后防', form: F('WDWWD') },
  KOR: { zh: '韩国', accent: '#0047a0', rank: 20, points: 1578, ovr: 78, att: 80, mid: 77, def: 74, titles: 0, note: '太极虎', form: F('WDWLW') },
  AUT: { zh: '奥地利', accent: '#ed2939', rank: 21, points: 1565, ovr: 79, att: 79, mid: 80, def: 77, titles: 0, note: '高位逼抢的欧洲快马', form: F('WWWDL') },
  NOR: { zh: '挪威', accent: '#ba0c2f', rank: 22, points: 1552, ovr: 80, att: 84, mid: 78, def: 75, titles: 0, note: '哈兰德领衔的北欧炮台', form: F('WWWDW') },
  CIV: { zh: '科特迪瓦', accent: '#ff8200', rank: 23, points: 1540, ovr: 78, att: 79, mid: 77, def: 76, titles: 0, note: '大象军团 · 非洲杯冠军', form: F('WDWWL') },
  SWE: { zh: '瑞典', accent: '#fecb00', rank: 24, points: 1528, ovr: 77, att: 79, mid: 76, def: 75, titles: 0, note: '北欧三叉戟', form: F('WLWDW') },
  EGY: { zh: '埃及', accent: '#c8102e', rank: 25, points: 1515, ovr: 77, att: 79, mid: 75, def: 75, titles: 0, note: '萨拉赫领衔的法老军团', form: F('WWDWD') },
  // ── Mid ──
  TUR: { zh: '土耳其', accent: '#e30a17', rank: 26, points: 1500, ovr: 78, att: 79, mid: 78, def: 74, titles: 0, note: '新月之星 · 青春风暴', form: F('WWLDW') },
  AUS: { zh: '澳大利亚', accent: '#00843d', rank: 27, points: 1488, ovr: 76, att: 74, mid: 75, def: 78, titles: 0, note: '袋鼠军团', form: F('WWDWL') },
  PAR: { zh: '巴拉圭', accent: '#d52b1e', rank: 28, points: 1475, ovr: 76, att: 74, mid: 75, def: 78, titles: 0, note: '南美铁卫', form: F('DWDWD') },
  SCO: { zh: '苏格兰', accent: '#0065bf', rank: 29, points: 1462, ovr: 76, att: 75, mid: 77, def: 75, titles: 0, note: '格子呢军团', form: F('WDLWW') },
  IRN: { zh: '伊朗', accent: '#239f40', rank: 30, points: 1450, ovr: 76, att: 76, mid: 75, def: 77, titles: 0, note: '波斯铁骑 · 亚洲常客', form: F('WWDWW') },
  TUN: { zh: '突尼斯', accent: '#e70013', rank: 31, points: 1438, ovr: 75, att: 73, mid: 74, def: 78, titles: 0, note: '迦太基之鹰', form: F('DWDLW') },
  ALG: { zh: '阿尔及利亚', accent: '#006233', rank: 32, points: 1425, ovr: 76, att: 77, mid: 75, def: 74, titles: 0, note: '沙漠之狐', form: F('WWWDL') },
  COD: { zh: '刚果（金）', accent: '#007fff', rank: 33, points: 1412, ovr: 75, att: 76, mid: 74, def: 74, titles: 0, note: '非洲新势力 · 美洲豹', form: F('WDWWD') },
  QAT: { zh: '卡塔尔', accent: '#8a1538', rank: 34, points: 1400, ovr: 74, att: 74, mid: 74, def: 73, titles: 0, note: '两届亚洲杯冠军', form: F('WWDLD') },
  KSA: { zh: '沙特阿拉伯', accent: '#006c35', rank: 35, points: 1388, ovr: 74, att: 73, mid: 74, def: 74, titles: 0, note: '青鹰 · 曾掀翻阿根廷', form: F('WLDWW') },
  GHA: { zh: '加纳', accent: '#006b3f', rank: 36, points: 1375, ovr: 75, att: 76, mid: 74, def: 73, titles: 0, note: '黑色之星', form: F('WDWLW') },
  // ── Lower ──
  BIH: { zh: '波黑', accent: '#002395', rank: 37, points: 1362, ovr: 74, att: 75, mid: 74, def: 72, titles: 0, note: '巴尔干龙', form: F('WDWDL') },
  IRQ: { zh: '伊拉克', accent: '#007a3d', rank: 38, points: 1350, ovr: 73, att: 73, mid: 72, def: 73, titles: 0, note: '美索不达米亚雄狮', form: F('WWDWD') },
  UZB: { zh: '乌兹别克斯坦', accent: '#1eb53a', rank: 39, points: 1338, ovr: 73, att: 73, mid: 73, def: 73, titles: 0, note: '中亚白狼 · 首次晋级', form: F('WWWDW') },
  JOR: { zh: '约旦', accent: '#007a3d', rank: 40, points: 1325, ovr: 72, att: 72, mid: 71, def: 73, titles: 0, note: '楔形之鹰 · 亚洲杯亚军', form: F('WDWWL') },
  RSA: { zh: '南非', accent: '#007749', rank: 41, points: 1312, ovr: 72, att: 72, mid: 71, def: 72, titles: 0, note: '彩虹之国 · 揭幕战对手', form: F('WWDLW') },
  CPV: { zh: '佛得角', accent: '#003893', rank: 42, points: 1300, ovr: 72, att: 72, mid: 71, def: 72, titles: 0, note: '蓝鲨 · 黑马首秀', form: F('WWDWL') },
  PAN: { zh: '巴拿马', accent: '#db0011', rank: 43, points: 1288, ovr: 72, att: 72, mid: 71, def: 72, titles: 0, note: '运河之子', form: F('WDLWD') },
  CZE: { zh: '捷克', accent: '#11457e', rank: 44, points: 1276, ovr: 75, att: 75, mid: 75, def: 74, titles: 0, note: '波西米亚雄狮', form: F('WDWLW') },
  NZL: { zh: '新西兰', accent: '#000000', rank: 45, points: 1264, ovr: 71, att: 70, mid: 70, def: 72, titles: 0, note: '全白军团 · 大洋洲霸主', form: F('WWWDW') },
  HAI: { zh: '海地', accent: '#00209f', rank: 46, points: 1252, ovr: 70, att: 71, mid: 69, def: 69, titles: 0, note: '加勒比黑马', form: F('WDWLL') },
  CUW: { zh: '库拉索', accent: '#002b7f', rank: 47, points: 1240, ovr: 70, att: 70, mid: 69, def: 70, titles: 0, note: '史上最小参赛国之一', form: F('WWDWD') },
};

/** 没有策展数据时的兜底 (理论上 48 队全覆盖)。 */
export const DEFAULT_META: Omit<TeamMeta, 'zh'> = {
  accent: '#19c8b9',
  rank: 50,
  points: 1200,
  ovr: 72,
  att: 72,
  mid: 71,
  def: 71,
  titles: 0,
  note: 'FIFA26参赛队',
  form: F('WDWDL'),
};
