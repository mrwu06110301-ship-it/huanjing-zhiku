/**
 * flue-quest-data.ts — 烟气探秘 v2 数据与算法
 *
 * v2 重构：剧情嵌入每个关卡（剧情开场 → 玩法 → 剧情收尾）
 * 依据标准：
 *  - HJ/T 397-2007 固定源废气监测技术规范（准备/参数/布点/质控框架）
 *  - GB/T 16157-1996 + 修改单（颗粒物测定与气态污染物采样）
 *  - HJ 836-2017 低浓度颗粒物重量法（采样头/称量恒重/全程序空白/同步双样）
 *  - HJ 1131/1132-2020 便携式紫外吸收法 SO2/NOx（校准/漂移/系统误差/注意事项）
 */

// GB/T 16157 圆形烟道等面积分环测点系数（表3）
export const CIRC_COEFFS: Record<number, number[]> = {
  1: [0.146, 0.854],
  2: [0.067, 0.25, 0.75, 0.933],
  3: [0.044, 0.146, 0.296, 0.704, 0.854, 0.956],
  4: [0.033, 0.105, 0.194, 0.323, 0.677, 0.806, 0.895, 0.967],
  5: [0.026, 0.082, 0.146, 0.226, 0.342, 0.658, 0.774, 0.854, 0.918, 0.974],
};

export interface CircPlan {
  rings: number;
  holes: number;
  ptsPerHole: number;
  totalPts: number;
  /** 每个测点：{hole, ring, coeff} — coeff 为距内壁距离系数(0~1) */
  points: { hole: number; ring: number; coeff: number }[];
}

export function planCircular(D: number): CircPlan {
  let holes: number;
  if (D <= 1.0) holes = 1;
  else if (D <= 4.0) holes = 2;
  else holes = 4;

  let rings: number;
  if (D < 0.3) rings = 0;
  else if (D < 0.6) rings = 1;
  else if (D < 1.0) rings = 2;
  else if (D < 2.0) rings = 3;
  else if (D < 4.0) rings = 4;
  else rings = 5;

  const coeffs = rings === 0 ? [0.5] : CIRC_COEFFS[rings];
  const holeAngles = holes === 1 ? [0] : holes === 2 ? [0, Math.PI / 2] : [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const points: CircPlan["points"] = [];
  for (let h = 0; h < holeAngles.length; h++) {
    coeffs.forEach((c, i) => points.push({ hole: h + 1, ring: i + 1, coeff: c }));
  }
  return { rings, holes, ptsPerHole: coeffs.length, totalPts: points.length, points };
}

export interface RectPlan {
  nA: number;
  nB: number;
  totalPts: number;
  points: { x: number; y: number; hole: number }[];
}

/** 矩形烟道等面积分块（HJ/T397 表4 长边限值加密） */
export function planRectangular(A: number, B: number): RectPlan {
  const area = A * B;
  let nA: number, nB: number;
  if (area <= 0.3) { nA = 1; nB = 1; }
  else if (area <= 0.5) { nA = 2; nB = 2; }
  else if (area <= 1.0) { nA = 2; nB = 3; }
  else if (area <= 4.0) { nA = 3; nB = 3; }
  else if (area <= 9.0) { nA = 3; nB = 4; }
  else if (area <= 16.0) { nA = 4; nB = 4; }
  else if (area <= 20.0) { nA = 4; nB = 5; }
  else { nA = Math.max(2, Math.ceil(A)); nB = Math.max(2, Math.ceil(B)); }

  const edgeLimit = area < 0.1 ? 0.32
    : area <= 0.5 ? 0.35
    : area <= 1.0 ? 0.50
    : area <= 4.0 ? 0.67
    : area <= 9.0 ? 0.75
    : 1.0;
  nA = Math.max(nA, Math.ceil(A / edgeLimit - 1e-9));
  nB = Math.max(nB, Math.ceil(B / edgeLimit - 1e-9));

  const points: RectPlan["points"] = [];
  for (let ja = 0; ja < nA; ja++) {
    for (let ib = 0; ib < nB; ib++) {
      points.push({ x: ((ja + 0.5) * A) / nA, y: ((ib + 0.5) * B) / nB, hole: ja + 1 });
    }
  }
  return { nA, nB, totalPts: nA * nB, points };
}

/* ================= 通用：剧情节点 ================= */

export interface StoryStep {
  /** 剧情文本 */
  text: string;
  /** 决策点（可选）：正确项打分 */
  choices?: { label: string; correct?: boolean; feedback: string }[];
  /** 场景插画 key */
  art?: string;
}

/* ================= 序章 · 接单备勤 ================= */

export const PROLOGUE: StoryStep[] = [
  {
    art: "office",
    text: "早上 8:00，监测科电话响了：「城东热电厂 3# 锅炉，BRF 排口，竣工验收监测，三天后出报告。」你放下电话，第一件事是——",
    choices: [
      { label: "查阅生产工艺、治理设施资料，编制监测方案", correct: true, feedback: "正确！HJ/T 397 第4章：监测前应收集技术资料、调查工况与治理设施，编制监测方案——方案里要写明监测项目、采样位置、频次和质保措施。" },
      { label: "背上烟尘仪直接出发，到现场再看", feedback: "到现场才发现没带够滤膜和标准气，来回折腾是野外大忌。方案先行，才能一次带齐。" },
      { label: "先泡杯茶缓缓", feedback: "……领导一个电话把你催醒了。时间紧，正事要紧。" },
    ],
  },
  {
    art: "office",
    text: "方案编好了：验收监测要求工况稳定、生产负荷达到设计能力的 75% 以上（含 75%），连续 1 小时采样或等间隔采 3~4 个样。出发前清点设备，最容易漏掉的一项是——",
    choices: [
      { label: "检查仪器检定/校准证书是否在有效期内", correct: true, feedback: "正确！HJ/T 397 第13章：强制检定目录内的计量器具必须按期检定合格；皮托管系数、采样嘴尺寸、流量计都要半年自校一次。" },
      { label: "多带两包烟和功能饮料", feedback: "野外补给可以有，但证书没带=白跑一趟，报告上没法签字。" },
    ],
  },
  {
    art: "platform",
    text: "9:30 到达电厂。45 米平台，采样孔在 8 米高的检修平台上。爬上去之前——",
    choices: [
      { label: "确认护栏牢固、佩戴安全带，再上平台", correct: true, feedback: "安全第一！采样平台应不小于 1.5m²、护栏 1.1m、挡板 ≥10cm、承重 ≥200kg/m²（HJ/T 397 5.1.5）。高处作业必须系挂安全带。" },
      { label: "设备轻，单手拎箱就往上爬", feedback: "爬梯拎箱是大忌——腾不出手抓扶手，仪器也容易脱手。" },
    ],
  },
];

/* ================= 第一关 · 测前准备 ================= */

export interface L1PrepPuzzle {
  /** 需要排序的操作步骤 */
  steps: { id: string; label: string; why: string }[];
  /** 正确顺序（id 顺序） */
  order: string[];
  /** 气密性判断题 */
  leakChecks: { q: string; options: string[]; correct: number; explain: string }[];
}

export const LEVEL1_PREP: L1PrepPuzzle = {
  steps: [
    { id: "s1", label: "清扫采样孔积灰，打开孔盖", why: "HJ/T 397 13.3.1：打开采样孔后应清除孔内积灰，再插入仪器" },
    { id: "s2", label: "连接采样管、除湿器、分析仪气路", why: "按仪器说明书连接气路电路，管线尽量短" },
    { id: "s3", label: "堵死采样管出口，抽气至负压 13kPa 后关泵", why: "HJ/T 397 8.4.1.3：检漏标准做法" },
    { id: "s4", label: "观察压力 1 分钟下降 ≤0.15kPa，判定合格", why: "1min 内下降不超过 0.15kPa 视为不漏气" },
    { id: "s5", label: "通入零点气，预热并校准仪器零点", why: "HJ 1131/1132 9.2：测前校准零点和校准量程" },
  ],
  order: ["s1", "s2", "s3", "s4", "s5"],
  leakChecks: [
    {
      q: "检漏时真空压力表显示负压 13kPa，关闭抽气泵一侧阀门后，1 分钟内压力降到 12.5kPa，下降 0.5kPa。怎么处理？",
      options: [
        "下降不大，继续采样",
        "系统漏气，分段检查、堵漏或重新安装，直至检漏合格",
        "多抽一会儿再测",
      ],
      correct: 1,
      explain: "1min 下降超过 0.15kPa 即判漏气，必须分段排查处理。漏气采样=样品作废，HJ 836/HJ 1131 都把检漏列为测前必做项。",
    },
    {
      q: "采样管加热温度应设置在什么范围？（紫外法测 SO2/NOx）",
      options: ["60~80℃", "120~160℃", "180~200℃"],
      correct: 1,
      explain: "HJ 1131/1132 7.1.2f)：采样管加热及保温温度 120℃~160℃ 内可设可调——防止水汽冷凝吸收 SO2/NO2 导致结果偏低。",
    },
  ],
};

/* ================= 第二关 · 排气参数测定 ================= */

/** 排气参数测量：读数选择（温度/动压/O2/含湿量） */
export interface ParamQuiz {
  id: string;
  scene: string;
  text: string;
  options: { label: string; correct?: boolean; feedback: string }[];
}

export const LEVEL2_PARAMS: ParamQuiz[] = [
  {
    id: "p1",
    scene: "测点 1 · 排气温度",
    text: "热电偶插入烟道中心附近，读数仍在波动。什么时候读数才有效？",
    options: [
      { label: "示值稳定后读数，且不可抽出烟道外读数", correct: true, feedback: "正确！HJ/T 397 6.1.3：待温度计读数稳定后读数；玻璃温度计严禁抽出烟道外读数——抽出即散热失真。" },
      { label: "插入 10 秒就读，效率优先", feedback: "温度未平衡读数偏差可达十几度，工况折算全错。" },
      { label: "抽出来对着光看刻度", feedback: "抽出炉外读数=读环境温度。HJ/T 397 明令禁止。" },
    ],
  },
  {
    id: "p2",
    scene: "测点 2 · 流速动压",
    text: "S 型皮托管测动压，皮托管全压测孔与气流方向的允许偏差是多少？断面最大流速与最小流速之比又有何要求？",
    options: [
      { label: "偏差 ≤10°；断面流速比不宜大于 3 倍", correct: true, feedback: "正确！HJ/T 397 6.5.4：全压孔正对气流偏差不超过 10°；13.3.2：断面最大/最小流速比不宜大于 3，否则仪器响应跟不上，等速精度下降。" },
      { label: "偏差 ≤30°；流速比不限", feedback: "30° 偏差动压余弦损失近 14%，流速比过大说明流场紊乱，不宜在该断面采样。" },
      { label: "皮托管随便放，仪器自动修正角度", feedback: "皮托管没有角度自修——物理规律不吃这套。" },
    ],
  },
  {
    id: "p3",
    scene: "测点 3 · 氧含量",
    text: "电化学测氧仪读数 12.6%，用于折算过量空气系数。测氧仪的日常质控要求是？",
    options: [
      { label: "至少每季度用高纯氮查零点、干净空气调 20.9%", correct: true, feedback: "正确！HJ/T 397 13.1.4：测氧仪至少每季度检查校验一次——高纯氮查零点，环境空气调示值 20.9%。O2 测不准，折算浓度全盘皆输。" },
      { label: "出厂标过，用到坏为止", feedback: "电化学传感器寿命 1~2 年且会漂移，不校准的 O2 数据不能用于折算。" },
      { label: "每年校一次就够", feedback: "季度级质控——氧含量直接影响折算浓度，是最敏感的参数之一。" },
    ],
  },
  {
    id: "p4",
    scene: "测点 4 · 含湿量",
    text: "干湿球法测含湿量：排气温度较低或水分含量较高时，正确操作是？",
    options: [
      { label: "采样管先保温/加热数分钟，再以 15L/min 抽气", correct: true, feedback: "正确！HJ/T 397 6.2.2：先加热保温防冷凝，15L/min 定流量抽气，干湿球稳定后读数并记录真空表压力。" },
      { label: "直接开泵 40L/min 快速抽", feedback: "流量过大湿球失水过快，读数不稳；标准规定 15L/min。" },
      { label: "湿球纱布干了正好，不用加水", feedback: "湿球没水就不是湿球了——纱布必须包好、容器注水。" },
    ],
  },
];

/* ================= 第三关 · 采样位置与布点 ================= */

/* ================= 第四关 · 颗粒物采样（HJ 836） ================= */

/** 称量流程排序 + 有效样品判定 */
export interface L4WeighPuzzle {
  steps: { id: string; label: string; why: string }[];
  order: string[];
  judge: {
    q: string;
    options: { label: string; correct?: boolean; feedback: string }[];
  }[];
}

export const LEVEL4_WEIGH: L4WeighPuzzle = {
  steps: [
    { id: "w1", label: "超声清洗前弯管/托网/铝圈，105~110℃ 烘干 1h", why: "HJ 836 8.2.1：去离子水超声清洗 5min 后烘干" },
    { id: "w2", label: "石英滤膜 180℃（或高于烟温 20℃）烘焙 1h", why: "石英滤膜烘焙去本底，取 180℃ 与烟温+20℃ 的较大值" },
    { id: "w3", label: "组装采样头，恒温恒湿平衡 ≥24h", why: "温度 15~30℃、湿度 50±5%RH 条件下平衡" },
    { id: "w4", label: "采样前称重 2 次（间隔>1h），偏差 ≤0.20mg", why: "HJ 836 8.2.2：两次称量最大偏差 0.20mg 内，取均值" },
    { id: "w5", label: "现场采样，采样后同条件再平衡 ≥24h", why: "采样前后平衡条件必须一致" },
    { id: "w6", label: "采样后称重 2 次，前后重量差=颗粒物量", why: "HJ 836 8.2.4：前后差值即颗粒物量" },
  ],
  order: ["w1", "w2", "w3", "w4", "w5", "w6"],
  judge: [
    {
      q: "同步双样结果：样品 A 浓度 8.0 mg/m³，样品 B 浓度 9.2 mg/m³。相对偏差多少？是否合格？",
      options: [
        { label: "14% —— 超过 10% 限值，作废", feedback: "C=8 时允许偏差 = 25−5×(8−1) = 15%，14% ≤ 15% 合格。低浓度样品允许更宽的偏差（线性放宽）。" },
        { label: "14% —— 允许偏差 25−5×(8−1)=15%，合格", correct: true, feedback: "正确！HJ 836 附录A：C>10mg/m³ 允许 10%；1<C≤10 时允许 25~10% 线性内插：25−5×(C−1)。C=8 → 15%，14% 合格。" },
        { label: "15% —— 刚好压线，风险太大作废", feedback: "算式对了但结论错了：15% 是允许上限，14% ≤ 15%，样品有效。" },
      ],
    },
    {
      q: "全程序空白增重 0.6 mg，对应测量系列平均采样体积 0.8 m³。这份实际样品还能用吗？",
      options: [
        { label: "能，空白与样品无关", feedback: "HJ 836 10.3.4：任何低于全程序空白增重的样品均无效。空白 0.6mg 折合浓度 0.75mg/m³，已经污染了测量下限。" },
        { label: "不能——样品增重若低于空白 0.6mg 即无效，本批数据存疑", correct: true, feedback: "正确！HJ 836 10.3.4：低于全程序空白增重的样品无效；且空白增重/平均体积不得超过排放限值的 10%。空白超标说明采样系统或操作存在沾污。" },
        { label: "空白大了重称一遍就行", feedback: "重称解决不了沾污——空白超标要查滤膜、镊子、样品箱整个链条。" },
      ],
    },
    {
      q: "判断：采样时断面最大流速 12 m/s、最小流速 2.5 m/s，流速比 4.8:1。这个断面可以直接采样吗？",
      options: [
        { label: "可以，仪器自动等速能兜住", feedback: "HJ 836 10.3.2：流速比不应大于 3:1。比值过大说明流场紊乱，等速跟踪跟不上，样品代表性差。" },
        { label: "不行——超过 3:1，应更换/调整采样断面", correct: true, feedback: "正确！HJ/T 397 13.3.2 与 HJ 836 10.3.2 一致：断面最大/最小流速比不宜大于 3:1，应优先选择气流平稳管段。" },
        { label: "多采几个点平均一下就行", feedback: "布点解决不了湍流问题——流速比超标要换断面，不是加密测点。" },
      ],
    },
  ],
};

/* ================= 第六关 · 气态污染物（HJ 1131/1132 便携式紫外吸收法） ================= */

/** 紫外法测定全流程：排序 + 审核判定 */
export interface L6GasPuzzle {
  /** 测定全流程步骤（第9章） */
  steps: { id: string; label: string; why: string }[];
  order: string[];
  /** 审核判断题 */
  judge: {
    q: string;
    options: { label: string; correct?: boolean; feedback: string }[];
  }[];
}

export const LEVEL6_GAS: L6GasPuzzle = {
  steps: [
    { id: "g1", label: "连接采样管、导气管，按 HJ 1045 做气密性检查", why: "HJ 1131/1132 9.1：连接后检查气密性，不合格应查漏和维护，直至合格" },
    { id: "g2", label: "开启仪器电源，充分预热稳定", why: "仪器必须充分地预热（13.3），预热不足读数漂移" },
    { id: "g3", label: "通入零点气，校准仪器零点", why: "9.2：零点气（≥99.99% 氮气或空气）先校零点" },
    { id: "g4", label: "通入标准气体，校准量程（气袋充排 3 次置换）", why: "9.2a)：标气充满集气袋后排空，反复 3 次再充满使用" },
    { id: "g5", label: "采样管插入点位，连续采样，5~15min 均值作样品值", why: "9.3：读数稳定后每分钟保存一个均值，连续 5~15min 平均作测定值" },
    { id: "g6", label: "测后置零点气，做示值误差/系统误差/漂移审核", why: "9.4：测后审核结果须满足 7.1.2，否则测试结果无效" },
    { id: "g7", label: "零气吹扫至示值正常后关机，整理装箱", why: "9.4f)：示值稳定后关机断开，电化学/光学器件忌带样气关机" },
  ],
  order: ["g1", "g2", "g3", "g4", "g5", "g6", "g7"],
  judge: [
    {
      q: "SO2 标气（80 μmol/mol）气袋法校准，正确操作是？",
      options: [
        { label: "标气充满集气袋后排空，反复 3 次，充满后 6h 内使用", correct: true, feedback: "正确！HJ 1131 9.2a)：充排反复 3 次置换袋内残留，充满后 6h 内使用；注意 NO 标气更娇气——3h 内用、浓度 ≤50 μmol/mol（HJ 1132）。" },
        { label: "气袋冲洗一次，充好放着明天用", feedback: "袋内残留空气置换不干净，且 SO2 标气 6h、NO 标气 3h 内必须使用——放置过夜浓度已衰减。" },
        { label: "直接把标气钢瓶接仪器上充袋，一次到位", feedback: "可以钢瓶法，但气袋法必须充排 3 次——一次充灌残留空气稀释标气，校准基准就歪了。" },
      ],
    },
    {
      q: "样品测定结果 6 mg/m³，仪器校准量程 C.S.=100 mg/m³。按 HJ 1131/1132 该怎么办？",
      options: [
        { label: "结果 < C.S. 的 20%，应重新选择校准量程复测", correct: true, feedback: "正确！12.2：测定结果应处于 C.S. 的 20%~100%，否则换量程；结果低于测定下限（SO2 8mg/m³、NO 4mg/m³）时不受此限。" },
        { label: "6 在量程 100 以内，直接报出", feedback: "低浓度用大量程=拿卷尺量头发丝，示值误差急剧放大，必须换小量程。" },
        { label: "乘个经验系数修正后报出", feedback: "没有这种系数——质控不满足就复测，编系数是数据造假。" },
      ],
    },
    {
      q: "测后审核：示值误差 +2.1%（限 ±3%）、系统误差 +4.2%（限 ±5%）、量程漂移 +3.5%（限 ±3%）。本次结果？",
      options: [
        { label: "量程漂移超限——测试结果无效，重新校准/维护后复测", correct: true, feedback: "正确！9.4e)/12.4：测后 b)c)d) 任何一项不满足 7.1.2，结果即无效——一票否决，不能「两项合格就放行」。" },
        { label: "三项里两项合格，结果有效", feedback: "一票否决——漂移超限说明仪器状态在变，继续用数据就是带病出报告。" },
        { label: "漂移是正常现象，记录一下就行", feedback: "正常现象也要在 ±3% 限值内。超限不是「记录一下」，是「重来」。",  },
      ],
    },
    {
      q: "排口烟道负压 −3.5kPa，仪器采样流量明显下降、读数偏低。怎么处理？",
      options: [
        { label: "换抗负压能力更大的仪器，或将负压烟气引至平衡装置再测", correct: true, feedback: "正确！13.5：负压过大导致无法正常采样时，选抗负压能力大于烟道负压的仪器，或把负压烟气引出到平衡装置内，消除影响后测定，过程中随时监控。" },
        { label: "继续测，报告里注明负压情况", feedback: "负压超能力时读数系统性偏低，注明救不了数据质量——先解决问题再测。" },
        { label: "采样泵流量调到最大硬抽", feedback: "硬抽改变采样状态照样测不准——标准路径是换仪器或引压平衡。" },
      ],
    },
  ],
};

/* ================= 第七关 · 质控与报告 ================= */

/** 折算计算 + 报告找错 */
export interface L7Calc {
  /** 已知数据 */
  given: { label: string; value: string }[];
  /** 折算填空题 */
  blanks: {
    id: string;
    label: string;
    answer: number;
    unit: string;
    tol: number;
    hint: string;
  }[];
  /** 报告找错 */
  reportErrors: { id: string; text: string; why: string }[];
  reportOk: string[];
}

export const LEVEL7_CALC: L7Calc = {
  given: [
    { label: "实测 SO2", value: "180 mg/m³" },
    { label: "实测 O2", value: "10.5 %" },
    { label: "标准规定 α", value: "1.7（燃煤锅炉）" },
    { label: "标干流量 Qsn", value: "6.5×10⁴ m³/h" },
  ],
  blanks: [
    {
      id: "alpha",
      label: "实测过量空气系数 α′ = 21/(21−O2)",
      answer: 2,
      unit: "",
      tol: 0.05,
      hint: "α′ = 21 / (21 − 10.5)",
    },
    {
      id: "cconv",
      label: "折算浓度 C = C′ × α′/α（mg/m³）",
      answer: 211.8,
      unit: "mg/m³",
      tol: 3,
      hint: "C = 180 × 2.0 / 1.7",
    },
  ],
  reportErrors: [
    {
      id: "e1",
      text: "「采样期间生产负荷约为设计能力的 58%，为赶工期正常采样。」",
      why: "HJ/T 397 4.3.5：验收监测须在工况稳定、生产负荷 ≥75% 设计能力时进行；负荷不足应调整工况或经主管部门同意并注明，不能悄悄采。",
    },
    {
      id: "e2",
      text: "「所用 SO2 标准气体已超过有效期 2 个月，仍在使用。」",
      why: "HJ/T 397 13.4.3：必须使用有证且在有效期内的标准物质——过期标气直接击穿量值溯源链。",
    },
    {
      id: "e3",
      text: "「颗粒物浓度 15 mg/m³，报告按 GB/T 16157 方法报出。」",
      why: "GB/T 16157 修改单：浓度 ≤20 mg/m³ 时应采用 HJ 836 测定，用 GB/T 16157 测低浓度只能表述为「<20 mg/m³」。",
    },
  ],
  reportOk: [
    "「采样前对系统进行了气密性检查，结果合格。」",
    "「监测期间同步记录了工况、气温、气压等参数。」",
  ],
};

/* ================= 第六关剧情开场 ================= */

export const LEVEL6_OPENING_STORY: StoryStep[] = [
  {
    art: "port",
    text: "颗粒物采完，轮到气态污染物。这次用的是便携式紫外吸收法分析仪（HJ 1131/1132）——它跟称重法完全是两套路数：不称重量，靠 SO2/NO 对紫外特征波长光的选择性吸收定量。开测前师傅考你：",
    choices: [
      { label: "它怕两样东西：颗粒物污染吸收池、冷凝水吸收 SO2/NO2——所以要除尘+全程伴热", correct: true, feedback: "正确！HJ 1131/1132 第5章「干扰和消除」：颗粒物污染吸收池需高效过滤器；水汽冷凝会吸收 SO2/NO2 导致结果偏低，必须加热采样管和导气管（120~160℃）或快速除湿。" },
      { label: "它跟测颗粒物差不多，插管就测", feedback: "差远了——重量法怕的是沾污和称量误差，紫外法怕的是光路污染和冷凝吸附，干扰逻辑完全不同。" },
      { label: "它怕电磁干扰，远离变电站就行", feedback: "不沾边——标准列的两大干扰是颗粒物和水汽，全部要在气路上解决。" },
    ],
  },
];

/* ================= 地图与结算 ================= */

export interface StageMeta {
  title: string;
  sub: string;
  max: number;
}

/** 各关元信息：标题/副标题/满分（总分 1250） */
export const STAGE_META: Record<string, StageMeta> = {
  prologue: { title: "序章 · 接单备勤", sub: "剧情选择", max: 100 },
  level1: { title: "第一关 · 测前准备", sub: "准备排序+检漏判断", max: 150 },
  level2: { title: "第二关 · 排气参数", sub: "温度/流速/O2/含湿量", max: 200 },
  level3: { title: "第三关 · 布点采样", sub: "等面积分环布点", max: 200 },
  level4: { title: "第四关 · 等速跟踪", sub: "实时等速采样挑战", max: 200 },
  level5: { title: "第五关 · 颗粒物称量", sub: "HJ836 流程+样品判定", max: 100 },
  level6: { title: "第六关 · 紫外法气态", sub: "HJ1131/1132 全流程", max: 200 },
  level7: { title: "第七关 · 质控报告", sub: "折算计算+报告找错", max: 100 },
};

/** 剧情面板顶部的章节标签 */
export const STORY_SCENE_META: Record<string, { title: string }> = {
  prologue: { title: "序章 · 接单备勤" },
  level2: { title: "第二关 · 排气参数 · 剧情开场" },
  level5: { title: "第五关 · 颗粒物称量 · 剧情开场" },
  level6: { title: "第六关 · 紫外法气态 · 剧情开场" },
  level7: { title: "第七关 · 质控报告 · 剧情开场" },
};

export const TOTAL_MAX = Object.values(STAGE_META).reduce((a, b) => a + b.max, 0);

/** 地图未开放的未来场景 */
export const MAP_LOCKED = [
  { id: "lock-ldar", title: "LDAR 泄漏猎手", sub: "敬请期待" },
  { id: "lock-water", title: "水质追踪", sub: "敬请期待" },
];

/* ================= 序章/第二关/第五关/第七关 剧情开场（供组件引用） ================= */

export const LEVEL7_OPENING_STORY: StoryStep[] = [
  {
    art: "office",
    text: "两天监测全部收工：颗粒物滤膜回实验室称量，SO2/NOx 紫外法数据当场打印。现在摊开记录出报告——燃煤锅炉排放标准规定 α=1.7，实测 O2 10.5%。第一件事：",
    choices: [
      { label: "算实测过量空气系数 α′，把实测浓度折算到 α=1.7", correct: true, feedback: "正确！GB/T 16157 / HJ/T 397 第12章：燃煤锅炉实测浓度必须折算到规定过量空气系数下再与限值比较。" },
      { label: "实测浓度直接和限值比", feedback: "不折算直接比，等于跟标准玩文字游戏——评审第一枪就毙。" },
    ],
  },
];

/* ================= 等速采样实时挑战（第四关） ================= */

/** 双正弦叠加模拟锅炉负荷波动 */
export function flowAt(tSec: number, base: number): number {
  return base * (1 + 0.18 * Math.sin(tSec * 0.9) + 0.08 * Math.sin(tSec * 2.3 + 1.2));
}

export const LEVEL_ISO = {
  durationSec: 75,
  baseVelocity: 9.6,
  /** 等速相对误差 ±10% 以内（GB/T 16157 7.3.1 / HJ 836 7.3.5） */
  tolerance: 0.10,
  maxScore: 200,
};
