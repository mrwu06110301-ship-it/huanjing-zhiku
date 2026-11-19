/**
 * flue-dust-flow.ts — 烟尘采样模型「流程式」计算引擎（11-19 第五轮重构）
 *
 * 【为什么要流程式】
 * 原来的 8 个分项工具是「并列关系」：用户自己知道要算什么就选哪个。
 * 现场实际是「串行关系」：静压 → 流速 → 等速流量 → 采样体积 → 排放，
 * 后一步的输入就是前一步的输出。流程式按现场作业顺序从上到下排列，
 * 参数全局复用（一份输入，跨步骤共用），缺哪步就提示哪步。
 *
 * 【五步流程】
 *  ① 静压计算     Δp、Kp、Ps 或 Pt        → Ps、Pt、烟气绝对压力 P
 *  ② 流速计算     Δp、Kp、t、Ba、Ps        → 湿烟气密度 ρ、烟气流速 Vs
 *  ③ 等速流量计算  d、Vs、Xsw             → 等速采样流量 Qrs
 *  ④ 采样体积计算  Qrs、n、t、Ba、Ps、t′/P′ → 工况体积 V、标况体积 Vnd
 *  ⑤ 排放计算     g1、g2、Vs、F、t、Ba、Ps、Xsw、O₂、O₂基准、负荷
 *                                    → Δg、C、Qs、标干烟气流量 Qn、折算浓度 Cα、排放速率 G
 *
 * 【口径约定】
 *  - 标态干基：标况体积 Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325
 *    （不含湿量因子：含湿量已在上游 Qrs 中扣除，重复扣水会偏小 0.374%）
 *  - 标干烟气流量 Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1−Xsw/100)
 *    （Qn 的含湿量因子要保留：它是烟气流量，不是采样体积）
 *  - 恒有 C × Qn × 10⁻⁶ ≡ G
 *  - 全表禁「湿基」「标杆」「3260」字样
 *
 * 公式来源：GB/T 16157 + 《烟尘相关计算公式(1).xlsx》（区块 5/8a/8b 逐格校对）
 */

import {
  DUST_T0, DUST_P0,
  dpToPressure, totalToStatic, staticToTotal,
  flueGasDensity, flueGasVelocity, isokineticFlow,
  volumeByFlowTime, volumeByMeterCondition,
  volumeByMeterToStandard, meterToStandardFactor,
  toStandardFactor, toStandardVolume, dryFactor,
  flueGasFlow, standardFlow, dustConcentration,
  alphaOf, adjustedConcentration, emissionRate,
  type VolumeMethod,
} from "./flue-dust-sampling";

/* ================= 类型 ================= */

export type DustFieldType = "number" | "select" | "o2base";

export interface DustField {
  key: string;
  label: string;
  sym: string;
  unit: string;
  type: DustFieldType;
  ph?: string;
  tip?: string;
  options?: { value: number | string; label: string }[];
}

export interface DustResultDef {
  key: string;
  label: string;
  unit: string;
  formula: string;
  digits: number;
  primary?: boolean;
  note?: string;
}

export interface DustStep {
  id: string;
  /** 步骤序号（1 起） */
  no: number;
  title: string;
  /** 步骤副标题 */
  desc: string;
  icon: string;
  /** 本步需要的输入字段 */
  fields: DustField[];
  /**
   * 本步输入依赖的上游产物 key。
   * 这些产物若算不出来，本步就提示「需先完成 XX 步」。
   */
  upstream?: string[];
  /** 本步产出的结果 */
  results: DustResultDef[];
  /** 本步用到的公式 */
  formulas: { title: string; lines: string[] }[];
  /** 本步的补充说明（口径、注意事项） */
  notes?: string[];
  /**
   * 本步额外的输入字段要求（不在 fields 里声明、但计算需要）。
   * 形如 { 字段key: "字段说明" }，缺失时用于提示。
   */
  requires?: string[];
}

const isN = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/* ================= 公共字段 ================= */
const F = {
  dp: (): DustField => ({
    key: "dp", label: "平均动压", sym: "Δp", unit: "Pa", type: "number", ph: "如 25",
  }),
  ps: (): DustField => ({
    key: "ps", label: "平均静压", sym: "Ps", unit: "kPa", type: "number", ph: "负压填负数",
    tip: "已知全压时可留空，由全压+动压反算",
  }),
  pt: (): DustField => ({
    key: "pt", label: "烟气全压", sym: "Pt", unit: "kPa", type: "number", ph: "如 0.06",
    tip: "已知静压时可留空，由静压+动压推算",
  }),
  temp: (): DustField => ({
    key: "temp", label: "平均烟温", sym: "t", unit: "℃", type: "number", ph: "如 93.4",
  }),
  ba: (): DustField => ({
    key: "ba", label: "大气压", sym: "Ba", unit: "kPa", type: "number", ph: "如 101.9",
  }),
  xsw: (): DustField => ({
    key: "xsw", label: "含湿量", sym: "Xsw", unit: "%", type: "number", ph: "如 7.89",
  }),
  kp: (): DustField => ({
    key: "kp", label: "皮托管系数", sym: "Kp", unit: "", type: "number", ph: "S 型 0.84",
  }),
  area: (): DustField => ({
    key: "area", label: "烟道截面积", sym: "F", unit: "m²", type: "number", ph: "如 1.7671",
  }),
  nozzle: (): DustField => ({
    key: "nozzle", label: "采样嘴直径", sym: "d", unit: "mm", type: "number", ph: "如 8",
  }),
  minutes: (): DustField => ({
    key: "minutes", label: "累计采样时长", sym: "n", unit: "min", type: "number", ph: "如 45",
  }),
  vs: (): DustField => ({
    key: "vs", label: "烟气流速", sym: "Vs", unit: "m/s", type: "number", ph: "如 17.3",
  }),
  qactual: (): DustField => ({
    key: "qactual", label: "实际烟气流量", sym: "Q", unit: "m³/h", type: "number", ph: "如 2579",
  }),
  meterTemp: (): DustField => ({
    key: "meterTemp", label: "计温", sym: "t′", unit: "℃", type: "number", ph: "流量计读数",
  }),
  meterP: (): DustField => ({
    key: "meterP", label: "计压", sym: "P′", unit: "kPa", type: "number", ph: "负压填负数",
  }),
  g1: (): DustField => ({
    key: "g1", label: "滤筒初始重量", sym: "g1", unit: "g", type: "number", ph: "如 10.1359",
  }),
  g2: (): DustField => ({
    key: "g2", label: "滤筒最终重量", sym: "g2", unit: "g", type: "number", ph: "如 10.1545",
  }),
  o2: (): DustField => ({
    key: "o2", label: "实测 O₂ 浓度", sym: "O₂", unit: "%", type: "number", ph: "如 14.2",
  }),
  o2base: (): DustField => ({
    key: "o2base", label: "基准含氧量", sym: "O₂s", unit: "%", type: "o2base", ph: "选择行业基准",
  }),
  load: (): DustField => ({
    key: "load", label: "负荷（出力）系数", sym: "k", unit: "", type: "number", ph: "一般取 1",
  }),
  volumeMethod: (): DustField => ({
    key: "method", label: "折算方法", sym: "", unit: "", type: "select",
    tip: "两法的工况体积口径不同（采样嘴处 / 流量计处），但标况体积结果一致",
    options: [
      { value: 1, label: "烟温静压法（工况体积取采样嘴处）" },
      { value: 2, label: "计温计压法（工况体积取流量计处）" },
    ],
  }),
};

/* ================= 步骤定义 ================= */

export const DUST_FLOW: DustStep[] = [
  /* ---------- ① 静压计算 ---------- */
  {
    id: "pressure",
    no: 1,
    title: "静压计算",
    desc: "全压与静压互相换算",
    icon: "layers",
    fields: [F.pt(), F.ps(), F.dp(), F.kp()],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4, primary: true },
      { key: "pt", label: "烟气全压 Pt", unit: "kPa", formula: "Pt = Ps + Δp·Kp²/1000", digits: 4 },
      { key: "dpPressure", label: "动压折算压增量", unit: "kPa", formula: "Δp·Kp²/1000", digits: 4 },
      { key: "pAbs", label: "烟气绝对压力 P", unit: "kPa", formula: "P = Ba + Ps", digits: 4 },
    ],
    formulas: [
      { title: "压力换算", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "Pt = Ps + Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
      ] },
    ],
    notes: [
      "全压与静压填任一即可，另一项自动推算并标「计算值」。",
      "烟气绝对压力 P 需填入大气压 Ba 才能算出。",
    ],
  },

  /* ---------- ② 流速计算 ---------- */
  {
    id: "velocity",
    no: 2,
    title: "流速计算",
    desc: "由动压、皮托管系数与烟气密度计算烟气流速",
    icon: "wind",
    fields: [F.dp(), F.kp(), F.temp(), F.ba()],
    upstream: ["ps"],
    results: [
      { key: "rho", label: "湿烟气密度 ρ", unit: "kg/m³", formula: "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
      { key: "vs", label: "烟气流速 Vs", unit: "m/s", formula: "Vs = 1.414 × Kp × √(Δp/ρ)", digits: 3, primary: true },
    ],
    formulas: [
      { title: "烟气密度", lines: [
        "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325",
      ] },
      { title: "烟气流速", lines: [
        "Vs = 1.414 × Kp × √(Δp/ρ)",
      ] },
    ],
    notes: [
      "动压 Δp 与皮托管系数 Kp 已在①步录入，此处复用，无需重复填。",
      "静压 Ps 由①步自动带入；大气压 Ba、烟温 t 需本步填写。",
    ],
  },

  /* ---------- ③ 等速采样流量计算 ---------- */
  {
    id: "isokinetic",
    no: 3,
    title: "等速流量计算",
    desc: "由采样嘴直径与烟气流速计算等速采样流量",
    icon: "calculator",
    fields: [F.nozzle(), F.xsw()],
    upstream: ["vs"],
    results: [
      { key: "qrs", label: "等速采样流量 Qrs", unit: "L/min", formula: "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)", digits: 2, primary: true },
      { key: "qh", label: "等速采样流量", unit: "m³/h", formula: "Qrs × 60", digits: 0 },
    ],
    formulas: [
      { title: "等速采样流量", lines: [
        "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)",
        "0.047 —— 单位换算系数",
      ] },
    ],
    notes: [
      "烟气流速 Vs 由②步自动带入。",
      "采样嘴直径 d 按厂家推荐值选取（如 8 mm）；含湿量 Xsw 用作干基折算。",
    ],
  },

  /* ---------- ④ 采样体积计算 ---------- */
  {
    id: "volume",
    no: 4,
    title: "采样体积计算",
    desc: "工况体积与标况体积（烟温静压法 / 计温计压法）",
    icon: "flask",
    fields: [F.minutes(), F.temp(), F.ba(), F.meterTemp(), F.meterP(), F.volumeMethod()],
    upstream: ["qrs"],
    results: [
      { key: "volumeCondition", label: "工况体积 V", unit: "L", formula: "V = Qrs × n（烟温静压法）", digits: 2 },
      { key: "volumeMeter", label: "工况体积 V′", unit: "L", formula: "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n", digits: 2 },
      { key: "vnd", label: "标况体积 Vnd", unit: "L", formula: "按所选方法折算到标态", digits: 2, primary: true },
      { key: "factor", label: "温度压力修正因子", unit: "", formula: "273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
      { key: "diff", label: "两法差值", unit: "L", formula: "两法标况体积之差（应≈0）", digits: 3 },
    ],
    formulas: [
      { title: "① 烟温静压法（工况体积取采样嘴处）", lines: [
        "V = Qrs × n",
        "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325",
      ] },
      { title: "② 计温计压法（工况体积取流量计处）", lines: [
        "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n",
        "Vnd = V' × 273.15/(273.15+t′) × (Ba+P′)/101.325",
      ] },
      { title: "两法关系", lines: [
        "两法的工况体积口径不同，标况体积必然一致",
        "含湿量已在上游等速采样流量中扣除，体积折算不再重复修正",
      ] },
    ],
    notes: [
      "等速采样流量 Qrs 由③步自动带入；烟温 t、大气压 Ba 复用②步已填的值。",
      "选「计温计压法」还需填计温 t′ 与计压 P′（流量计读数）。",
    ],
  },

  /* ---------- ⑤ 排放计算 ---------- */
  {
    id: "emission",
    no: 5,
    title: "排放计算",
    desc: "烟尘增重、浓度、实际流量、标干流量与排放速率",
    icon: "chimney",
    fields: [F.g1(), F.g2(), F.area(), F.xsw(), F.o2(), F.o2base(), F.load()],
    upstream: ["vnd", "vs"],
    results: [
      { key: "mass", label: "烟尘增重 Δg", unit: "g", formula: "Δg = g2 − g1", digits: 4 },
      { key: "c", label: "颗粒物浓度 C", unit: "mg/m³", formula: "C = Δg / Vnd × 10⁶", digits: 2, primary: true },
      { key: "qs", label: "实际烟气流量 Qs", unit: "m³/h", formula: "Qs = Vs × F × 3600", digits: 0 },
      { key: "qn", label: "标干烟气流量 Qn", unit: "m³/h", formula: "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", digits: 0 },
      { key: "alpha", label: "过剩空气系数 α", unit: "", formula: "α = 21 / (21 − O₂实测)", digits: 4 },
      { key: "alphaS", label: "折算系数 αs", unit: "", formula: "αs = 21 / (21 − O₂基准)", digits: 4 },
      { key: "cadj", label: "折算浓度 Cα", unit: "mg/m³", formula: "Cα = C × α/αs × 出力系数", digits: 2 },
      { key: "g", label: "颗粒物排放速率 G", unit: "kg/h", formula: "G = C × Qn × 10⁻⁶", digits: 4, primary: true },
    ],
    formulas: [
      { title: "烟尘增重与浓度", lines: [
        "Δg = g2 − g1",
        "C = Δg / Vnd × 10⁶",
      ] },
      { title: "烟气流量", lines: [
        "Qs = Vs × F × 3600（实际烟气流量）",
        "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)（标干烟气流量）",
      ] },
      { title: "含氧量折算与排放速率", lines: [
        "α = 21/(21 − O₂实测)；αs = 21/(21 − O₂基准)",
        "Cα = C × α/αs × 出力系数",
        "G = C × Qn × 10⁻⁶（颗粒物排放速率，kg/h）",
      ] },
    ],
    notes: [
      "标况体积 Vnd 与烟气流速 Vs 由前序步骤自动带入。",
      "滤筒重量需烘干至恒重后称量；负荷（出力）系数锅炉按运行年限查表，验收监测一般取 1。",
    ],
  },
];

/* ==================================================================
 *  统一计算器
 * ================================================================== */

export interface FlowValue {
  key: string;
  label: string;
  unit: string;
  formula: string;
  digits: number;
  value: number | null;
  note?: string;
  /** 缺失依赖说明（value 为 null 时有效） */
  missing: string;
  primary?: boolean;
}

export interface FlowStepState {
  id: string;
  no: number;
  title: string;
  desc: string;
  icon: string;
  /** 本步是否已算出全部主要结果 */
  done: boolean;
  /** 本步缺少的输入项（灰色提示文字） */
  hint: string;
  /** 本步结果（竖列报表行） */
  rows: FlowValue[];
  formulas: { title: string; lines: string[] }[];
  notes: string[];
}

export interface FlowResult {
  /** 步骤 id → 步骤状态 */
  steps: Record<string, FlowStepState>;
  /** 全部产物 key → 数值 */
  values: Record<string, number | null>;
  /** 计算步骤说明（管理员可见） */
  steps_log: string[];
  /** 已完成的步骤数 */
  doneCount: number;
  totalCount: number;
}

/** 字段 key → 显示名 */
const FIELD_LABEL: Record<string, string> = {
  dp: "平均动压 Δp", ps: "平均静压 Ps", pt: "烟气全压 Pt", temp: "平均烟温 t",
  ba: "大气压 Ba", xsw: "含湿量 Xsw", kp: "皮托管系数 Kp", area: "烟道截面积 F",
  nozzle: "采样嘴直径 d", minutes: "累计采样时长 n", volume: "实际采样体积 V",
  vs: "烟气流速 Vs", qactual: "实际烟气流量 Q",
  meterTemp: "计温 t′", meterP: "计压 P′", g1: "滤筒初始重量 g1", g2: "滤筒最终重量 g2",
  o2: "实测 O₂ 浓度", o2base: "基准含氧量", load: "负荷（出力）系数",
  method: "折算方法",
};

/** 结果 key → 显示名 */
const RESULT_LABEL: Record<string, string> = {
  ps: "烟气静压 Ps", pt: "烟气全压 Pt", dpPressure: "动压折算压增量",
  pAbs: "烟气绝对压力 P", rho: "湿烟气密度 ρ", vs: "烟气流速 Vs",
  qrs: "等速采样流量 Qrs", qh: "等速采样流量",
  volumeCondition: "工况体积 V", volumeMeter: "工况体积 V′", vnd: "标况体积 Vnd",
  factor: "温度压力修正因子", diff: "两法差值",
  mass: "烟尘增重 Δg", c: "颗粒物浓度 C", qs: "实际烟气流量 Qs",
  qn: "标干烟气流量 Qn", alpha: "过剩空气系数 α", alphaS: "折算系数 αs",
  cadj: "折算浓度 Cα", g: "颗粒物排放速率 G",
};

/**
 * 全压/静压互算：返回 { ps, pt, from }
 *
 * measured：用户最后手动编辑的字段（'ps' 或 'pt'），即实测基准。
 *   - measured='ps' → 以静压为实测，全压由静压+动压推算
 *   - measured='pt' → 以全压为实测，静压由全压+动压反算
 *   - 未指定 → 优先取静压（与 Excel 区块口径一致）
 */
function resolvePressures(
  ps: number | null, pt: number | null, dp: number | null, kp: number | null,
  measured?: string | null,
  derived?: string[]
): { ps: number | null; pt: number | null; from: string } {
  const hasDpKp = isN(dp) && isN(kp);
  const derivedSet = new Set(derived ?? []);
  const psReal = isN(ps) && !derivedSet.has("ps");
  const ptReal = isN(pt) && !derivedSet.has("pt");

  let base: "ps" | "pt" | null = null;
  if (measured === "ps" && psReal) base = "ps";
  else if (measured === "pt" && ptReal) base = "pt";
  else if (measured === "ps" && ptReal) base = "pt";
  else if (measured === "pt" && psReal) base = "ps";
  else if (psReal) base = "ps";
  else if (ptReal) base = "pt";

  if (base === "ps" && hasDpKp) {
    return { ps, pt: staticToTotal(ps!, dp!, kp!), from: "全压由静压+动压推算" };
  }
  if (base === "pt" && hasDpKp) {
    return { ps: totalToStatic(pt!, dp!, kp!), pt, from: "静压由全压+动压反算" };
  }
  if (isN(ps)) return { ps, pt, from: "静压实测，全压未算" };
  if (isN(pt)) return { ps, pt, from: "全压实测，静压未算" };
  return { ps: null, pt: null, from: "" };
}

/**
 * 流程计算：按步骤顺序逐级计算，参数全局复用。
 *
 * @param v        全部输入值（扁平表）
 * @param opts     { measured, derived } 实测基准与派生值标记
 */
export function computeFlow(
  v: Record<string, number | null>,
  opts?: { measured?: string | null; derived?: string[] }
): FlowResult {
  const measured = opts?.measured ?? null;
  const derived = opts?.derived ?? [];
  const values: Record<string, number | null> = {};
  const log: string[] = [];
  const steps: Record<string, FlowStepState> = {};

  /* ---------- ① 静压 ---------- */
  const { ps, pt, from: psFrom } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
  const dpPressure = isN(v.dp) && isN(v.kp) ? dpToPressure(v.dp, v.kp) : null;
  const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;

  values.ps = ps;
  values.pt = pt;
  values.dpPressure = dpPressure;
  values.pAbs = pAbs;

  if (dpPressure !== null) {
    log.push(`动压折算：Δp·Kp²/1000 = (${v.dp}/1000)×${v.kp}² = ${dpPressure.toFixed(4)} kPa`);
  }
  if (dpPressure !== null && ps !== null && pt !== null) {
    log.push(psFrom.startsWith("全压由")
      ? `Pt = Ps + ${dpPressure.toFixed(4)} = ${pt.toFixed(4)} kPa`
      : `Ps = Pt − ${dpPressure.toFixed(4)} = ${ps.toFixed(4)} kPa`);
  }

  /* ---------- ② 流速 ---------- */
  const rho = isN(v.temp) && isN(pAbs) ? flueGasDensity(v.temp, pAbs) : null;
  const vs = isN(v.dp) && isN(v.kp) && isN(rho) ? flueGasVelocity(v.dp, v.kp, rho) : null;
  values.rho = rho;
  values.vs = vs;
  if (rho !== null) {
    log.push(`ρ = 1.34 × ${(DUST_T0 / (DUST_T0 + v.temp!)).toFixed(5)} × ${(pAbs! / DUST_P0).toFixed(5)} = ${rho.toFixed(5)} kg/m³`);
  }
  if (vs !== null) log.push(`Vs = 1.414 × ${v.kp} × √(${v.dp}/${rho!.toFixed(5)}) = ${vs.toFixed(3)} m/s`);

  /* ---------- ③ 等速采样流量 ---------- */
  const qrs = isN(v.nozzle) && isN(vs) && isN(v.xsw) ? isokineticFlow(v.nozzle, vs, v.xsw) : null;
  const qh = qrs !== null ? qrs * 60 : null;
  values.qrs = qrs;
  values.qh = qh;
  if (qrs !== null) {
    log.push(`Qrs = 0.047 × ${v.nozzle}² × ${vs!.toFixed(3)} × ${(1 - v.xsw! / 100).toFixed(4)} = ${qrs.toFixed(2)} L/min`);
  }

  /* ---------- ④ 采样体积 ---------- */
  const method: VolumeMethod = v.method === 2 ? "meter" : "flowTemp";
  const vFlowTemp = isN(qrs) && isN(v.minutes)
    ? volumeByFlowTime(qrs, v.minutes)
    : (isN(v.volume) ? v.volume : null);
  const factorFlow = isN(v.temp) && isN(pAbs) ? toStandardFactor(v.temp, pAbs) : null;
  const vndFlow = vFlowTemp !== null && factorFlow !== null
    ? toStandardVolume(vFlowTemp, v.temp!, pAbs!)
    : null;

  const meterPAbs = isN(v.ba) && isN(v.meterP) ? v.ba + v.meterP : null;
  const vMeter = isN(qrs) && isN(v.minutes) && isN(pAbs) && isN(v.meterTemp)
    && isN(meterPAbs) && isN(v.temp)
    ? volumeByMeterCondition(qrs, v.minutes, pAbs, v.meterTemp, meterPAbs, v.temp)
    : null;
  const factorMeter = isN(v.meterTemp) && isN(meterPAbs)
    ? meterToStandardFactor(v.meterTemp, meterPAbs)
    : null;
  const vndMeter = vMeter !== null && factorMeter !== null
    ? volumeByMeterToStandard(vMeter, v.meterTemp!, meterPAbs!)
    : null;

  const vnd = method === "meter" ? vndMeter : vndFlow;
  const factor = method === "meter" ? factorMeter : factorFlow;
  const volumeCondition = method === "meter" ? vMeter : vFlowTemp;
  const diff = vndFlow !== null && vndMeter !== null ? vndFlow - vndMeter : null;

  values.volumeCondition = volumeCondition;
  values.volumeMeter = vMeter;
  values.vnd = vnd;
  values.factor = factor;
  values.diff = diff;

  if (factorFlow !== null) {
    log.push(`烟温静压法 修正因子 = ${(DUST_T0 / (DUST_T0 + v.temp!)).toFixed(5)} × ${(pAbs! / DUST_P0).toFixed(5)} = ${factorFlow.toFixed(5)}`);
  }
  if (vndFlow !== null) {
    log.push(`烟温静压法 Vnd = ${vFlowTemp!.toFixed(2)} × ${factorFlow!.toFixed(5)} = ${vndFlow.toFixed(2)} L`);
  }
  if (vMeter !== null) {
    log.push(`计温计压法 V' = ${qrs} × ${pAbs!.toFixed(3)}×${(DUST_T0 + v.meterTemp!).toFixed(2)} / ${meterPAbs!.toFixed(3)}×${(DUST_T0 + v.temp!).toFixed(2)} × ${v.minutes} = ${vMeter.toFixed(2)} L`);
  }
  if (vndMeter !== null) {
    log.push(`计温计压法 Vnd = ${vMeter!.toFixed(2)} × ${factorMeter!.toFixed(5)} = ${vndMeter.toFixed(2)} L`);
  }
  if (diff !== null) log.push(`两法标况体积差 = ${diff.toFixed(3)} L（应≈0）`);

  /* ---------- ⑤ 排放 ---------- */
  const mass = isN(v.g1) && isN(v.g2) ? v.g2 - v.g1 : null;
  const c = isN(mass) && isN(vnd) ? dustConcentration(mass, vnd) : null;
  const alpha = isN(v.o2) ? alphaOf(v.o2) : null;
  const alphaS = isN(v.o2base) ? alphaOf(v.o2base) : null;
  const cadj = isN(c) && isN(alpha) && isN(alphaS) && isN(v.load)
    ? adjustedConcentration(c, v.o2!, v.o2base!, v.load!)
    : null;
  const qs = isN(vs) && isN(v.area) ? flueGasFlow(vs, v.area) : null;
  const qn = isN(qs) && isN(v.temp) && isN(pAbs)
    ? standardFlow(qs, v.temp, pAbs, v.xsw ?? 0)
    : null;
  const g = isN(c) && isN(qn) ? emissionRate(c, qn) : null;

  values.mass = mass;
  values.c = c;
  values.alpha = alpha;
  values.alphaS = alphaS;
  values.cadj = cadj;
  values.qs = qs;
  values.qn = qn;
  values.g = g;

  if (mass !== null) log.push(`Δg = ${v.g2} − ${v.g1} = ${mass.toFixed(4)} g`);
  if (c !== null) log.push(`C = Δg/Vnd × 10⁶ = ${c.toFixed(2)} mg/m³`);
  if (qs !== null) log.push(`Qs = Vs × F × 3600 = ${qs.toFixed(0)} m³/h`);
  if (qn !== null) log.push(`Qn = Qs × 修正因子 × (1−Xsw/100) = ${qn.toFixed(0)} m³/h`);
  if (cadj !== null) log.push(`Cα = C × α/αs × 出力系数 = ${cadj.toFixed(2)} mg/m³`);
  if (g !== null) log.push(`G = C × Qn × 10⁻⁶ = ${g.toFixed(4)} kg/h`);

  /* ==================================================================
   *  组装步骤状态（含缺参提示）
   * ================================================================== */

  /** 每个步骤的输入缺失检查 */
  const stepInputs: Record<string, string[]> = {
    // ① 静压：Ps 或 Pt 至少一个 + 动压 + Kp
    pressure: [
      ...(isN(v.ps) || isN(v.pt) ? [] : ["平均静压 Ps（或烟气全压 Pt）"]),
      ...(isN(v.dp) ? [] : ["平均动压 Δp"]),
      ...(isN(v.kp) ? [] : ["皮托管系数 Kp"]),
    ],
    // ② 流速：Δp、Kp、t、Ba + 上游 Ps
    velocity: [
      ...(isN(v.dp) ? [] : ["平均动压 Δp"]),
      ...(isN(v.kp) ? [] : ["皮托管系数 Kp"]),
      ...(isN(v.temp) ? [] : ["平均烟温 t"]),
      ...(isN(v.ba) ? [] : ["大气压 Ba"]),
      ...(isN(ps) ? [] : ["①步的静压 Ps"]),
    ],
    // ③ 等速流量：d、Xsw + 上游 Vs
    isokinetic: [
      ...(isN(v.nozzle) ? [] : ["采样嘴直径 d"]),
      ...(isN(v.xsw) ? [] : ["含湿量 Xsw"]),
      ...(isN(vs) ? [] : ["②步的烟气流速 Vs"]),
    ],
    // ④ 采样体积：n、t、Ba + 上游 Qrs（计温计压法另需 t′、P′）
    volume: [
      ...(isN(v.minutes) ? [] : ["累计采样时长 n"]),
      ...(isN(v.temp) ? [] : ["平均烟温 t"]),
      ...(isN(v.ba) ? [] : ["大气压 Ba"]),
      ...(isN(qrs) ? [] : ["③步的等速采样流量 Qrs"]),
      ...(method === "meter" && !isN(v.meterTemp) ? ["计温 t′"] : []),
      ...(method === "meter" && !isN(v.meterP) ? ["计压 P′"] : []),
    ],
    // ⑤ 排放：g1、g2、F + 上游 Vnd、Vs（O₂/负荷属可选折算项）
    emission: [
      ...(isN(v.g1) ? [] : ["滤筒初始重量 g1"]),
      ...(isN(v.g2) ? [] : ["滤筒最终重量 g2"]),
      ...(isN(v.area) ? [] : ["烟道截面积 F"]),
      ...(isN(vnd) ? [] : ["④步的标况体积 Vnd"]),
      ...(isN(vs) ? [] : ["②步的烟气流速 Vs"]),
    ],
  };

  /** 各结果项的缺失依赖说明 */
  const resultDeps: Record<string, string[]> = {
    ps: ["ps|pt", "dp", "kp"],
    pt: ["ps|pt", "dp", "kp"],
    dpPressure: ["dp", "kp"],
    pAbs: ["ba", "ps|pt"],
    rho: ["temp", "ba", "ps|pt"],
    vs: ["dp", "kp", "temp", "ba", "ps|pt"],
    qrs: ["nozzle", "vs", "xsw"],
    qh: ["qrs"],
    volumeCondition: ["qrs", "minutes"],
    volumeMeter: ["qrs", "minutes", "ba", "ps|pt", "temp", "meterTemp", "meterP"],
    vnd: ["qrs", "minutes", "temp", "ba", "ps|pt"],
    factor: ["temp", "ba", "ps|pt"],
    diff: ["qrs", "minutes", "temp", "ba", "ps|pt", "meterTemp", "meterP"],
    mass: ["g1", "g2"],
    c: ["mass", "vnd"],
    qs: ["vs", "area"],
    qn: ["qs", "temp", "ba", "ps|pt", "xsw"],
    alpha: ["o2"],
    alphaS: ["o2base"],
    cadj: ["c", "alpha", "alphaS", "load"],
    g: ["c", "qn"],
  };

  const hasField = (k: string) => isN(v[k]);
  const hasValue = (k: string) => isN(values[k]);

  /** 计算某结果的缺失说明 */
  function missingOf(key: string): string {
    const rules = resultDeps[key];
    if (!rules) return "";
    const miss: string[] = [];
    for (const rule of rules) {
      if (rule.includes("|")) {
        const groups = rule.split("|").map((g) => g.split("+").filter(Boolean));
        const anyOk = groups.some((grp) => grp.every((f) => (f in values ? hasValue(f) : hasField(f))));
        if (!anyOk) {
          const grp = groups[0];
          const lack = grp.filter((f) => !(f in values ? hasValue(f) : hasField(f)));
          miss.push(lack.map((f) => FIELD_LABEL[f] || f).join("、"));
        }
        continue;
      }
      if (rule.includes("+")) {
        const parts = rule.split("+").filter(Boolean);
        const lack = parts.filter((f) => !(f in values ? hasValue(f) : hasField(f)));
        if (lack.length) miss.push(lack.map((f) => FIELD_LABEL[f] || f).join("、"));
        continue;
      }
      if (!(rule in values ? hasValue(rule) : hasField(rule))) {
        miss.push(FIELD_LABEL[rule] || rule);
      }
    }
    return miss.length ? "缺 " + Array.from(new Set(miss)).join("、") : "";
  }

  let doneCount = 0;
  for (const st of DUST_FLOW) {
    const missingInputs = stepInputs[st.id] ?? [];
    const rows: FlowValue[] = st.results.map((d) => {
      const val = values[d.key] ?? null;
      const note = d.key === "ps" || d.key === "pt" ? psFrom : undefined;
      return {
        key: d.key,
        label: d.label,
        unit: d.unit,
        formula: d.formula,
        digits: d.digits,
        value: val,
        note: note || d.note,
        missing: val === null ? missingOf(d.key) : "",
        primary: d.primary,
      };
    });
    // 本步完成判定：主要结果有值，且无缺失输入
    const primaryRows = rows.filter((r) => r.primary);
    const done = missingInputs.length === 0 && primaryRows.every((r) => r.value !== null);
    if (done) doneCount++;

    steps[st.id] = {
      id: st.id,
      no: st.no,
      title: st.title,
      desc: st.desc,
      icon: st.icon,
      done,
      hint: missingInputs.length ? `待补：${missingInputs.join("、")}` : "",
      rows,
      formulas: st.formulas,
      notes: st.notes ?? [],
    };
  }

  return { steps, values, steps_log: log, doneCount, totalCount: DUST_FLOW.length };
}

/* ==================================================================
 *  示例数据
 * ================================================================== */

export const DUST_FLOW_DEMO: Record<string, number | null> = {
  dp: 25, ps: 0.01, pt: 0.06, temp: 31.8, ba: 101.9, xsw: 0.38, kp: 0.84,
  area: 7.28, nozzle: 12, minutes: 120, volume: null,
  meterTemp: 39.2, meterP: -3.38, method: 1,
  g1: 10.13587, g2: 10.15447, o2: 14.2, o2base: 9, load: 1,
};

/** 字段 key → 显示名（供 UI 使用） */
export const DUST_FIELD_LABEL = FIELD_LABEL;
/** 结果 key → 显示名（供 UI 使用） */
export const DUST_RESULT_LABEL = RESULT_LABEL;
