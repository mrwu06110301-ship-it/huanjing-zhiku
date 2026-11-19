/**
 * flue-dust-modes.ts — 烟尘采样分项计算模式注册表
 *
 * 按《烟尘相关计算公式(1).xlsx》的 8 个区块拆分为独立计算模式，
 * 每个模式有独立的输入项、公式与结果；另含「综合版」全链路模式。
 *
 * 设计要点：
 *  - 各模式共享 flue-dust-sampling.ts 的纯函数原语，保证口径完全一致
 *  - 每个字段声明类型/单位/符号/占位符，UI 由声明驱动渲染
 *  - 「需要烟温静压」「需要计温计压」等工况条件按模式显式声明
 */

import {
  DUST_T0, DUST_P0,
  dpToPressure, totalToStatic, staticToTotal,
  flueGasDensity, flueGasVelocity, isokineticFlow, nozzleFromFlow,
  volumeByFlowTime, volumeByMeterCondition,
  toStandardFactor, toStandardVolume, dryFactor,
  flueGasFlow, standardFlow, dustConcentration, alphaOf, adjustedConcentration, emissionRate,
} from "./flue-dust-sampling";

/* ================= 字段定义 ================= */
export type DustFieldType = "number" | "select" | "o2base";

export interface DustField {
  key: string;
  label: string;
  sym: string;
  unit: string;
  type: DustFieldType;
  ph?: string;
  /** 说明：显示在字段下方的小字 */
  tip?: string;
  /** 选项（select 类型） */
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
  /**
   * 依赖声明见中央表 DUST_DEP_RULES（按结果 key 索引），
   * 语法："field" 需要该输入字段；"a+b" 组内全需；"a|b" 组内任一满足即可。
   */
}

export interface DustMode {
  id: string;
  name: string;
  short: string;
  desc: string;
  icon: string;
  /** Excel 区块对应说明 */
  ref: string;
  fields: DustField[];
  results: DustResultDef[];
  /** 本模式用到的公式（公式说明面板随模式同步） */
  formulas: { title: string; lines: string[] }[];
  /**
   * 计算函数：输入值映射 → 结果值映射 + 步骤说明
   * fills  ：结果 → 回填到哪个输入框（输入框即显示）
   * opts   ：计算上下文（实测基准标记等）
   */
  compute: (v: Record<string, number | null>, opts?: DustComputeOpts) => {
    values: Record<string, number | null>;
    notes: Record<string, string | undefined>;
    steps: string[];
    /** 结果回填映射：{ 结果key: 输入框key } */
    fills?: Record<string, string>;
  };
}

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
  qrs: (): DustField => ({
    key: "qrs", label: "等速采样流量", sym: "Qrs", unit: "L/min", type: "number", ph: "如 36.41",
  }),
  minutes: (): DustField => ({
    key: "minutes", label: "累计采样时长", sym: "n", unit: "min", type: "number", ph: "如 45",
  }),
  volume: (): DustField => ({
    key: "volume", label: "实际采样体积", sym: "V", unit: "L", type: "number", ph: "如 2068.2",
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
};

/* ================= 工具函数 ================= */
const isN = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * 计算上下文
 *
 * measured：用户最后手动编辑的压力字段（'ps' 或 'pt'），即实测基准。
 *   引擎据此判断「谁是实测、谁是派生」，实现全压↔静压双向互转不互相覆盖。
 * derived：当前由计算派生出来的字段（不是用户输入的实测值）。
 *   派生值不得反过来当作基准，否则会出现「清空后又被自己填回」的循环。
 */
export interface DustComputeOpts {
  measured?: string | null;
  derived?: string[];
}

/**
 * 全压/静压互算：返回 { ps, pt }
 *
 * measured：用户最后手动编辑的字段（'ps' 或 'pt'），即实测基准。
 *   - measured='ps' → 以静压为实测，全压由静压+动压推算
 *   - measured='pt' → 以全压为实测，静压由全压+动压反算
 *   - 未指定 → 优先取静压（与 Excel 区块口径一致）
 *
 * 这样「填全压→静压自动显示」「改静压→全压自动显示」可反复互转，
 * 不会出现后写入的值被先写入的值反向覆盖。
 */
function resolvePressures(
  ps: number | null, pt: number | null, dp: number | null, kp: number | null,
  measured?: string | null,
  derived?: string[]
): { ps: number | null; pt: number | null; from: string; base: "ps" | "pt" | null } {
  const hasDpKp = isN(dp) && isN(kp);
  const derivedSet = new Set(derived ?? []);
  // 派生值不得作为基准（否则清空后会被自己填回，形成循环）
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
    return { ps, pt: staticToTotal(ps!, dp!, kp!), from: "全压由静压+动压推算", base };
  }
  if (base === "pt" && hasDpKp) {
    return { ps: totalToStatic(pt!, dp!, kp!), pt, from: "静压由全压+动压反算", base };
  }
  if (isN(ps)) return { ps, pt, from: "静压实测，全压未算", base: "ps" };
  if (isN(pt)) return { ps, pt, from: "全压实测，静压未算", base: "pt" };
  return { ps: null, pt: null, from: "", base: null };
}

/**
 * 压力类结果 → 输入框的回填映射
 *
 * 只有一个是实测基准（base），另一个是派生值；
 * 派生值回填到对应输入框（输入框即显示），基准值保持用户输入。
 */
function pressureFills(
  v: Record<string, number | null>,
  measured: string | null | undefined,
  hasPsField: boolean,
  hasPtField: boolean,
  derived?: string[]
): Record<string, string> {
  const fills: Record<string, string> = {};
  const derivedSet = new Set(derived ?? []);
  const psReal = isN(v.ps) && !derivedSet.has("ps");
  const ptReal = isN(v.pt) && !derivedSet.has("pt");

  let base: "ps" | "pt" | null = null;
  if (measured === "ps" && psReal) base = "ps";
  else if (measured === "pt" && ptReal) base = "pt";
  else if (measured === "ps" && ptReal) base = "pt";
  else if (measured === "pt" && psReal) base = "ps";
  else if (psReal) base = "ps";
  else if (ptReal) base = "pt";

  if (base === "ps" && hasPtField) fills.pt = "pt";
  else if (base === "pt" && hasPsField) fills.ps = "ps";
  return fills;
}

/* ================= 模式定义 ================= */
export const DUST_MODES: DustMode[] = [
  /* ---------- 1. 烟气静压计算（全压 ↔ 静压 双向换算） ---------- */
  {
    formulas: [
      { title: "压力换算", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "Pt = Ps + Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
      ] },
    ],
    id: "static-pressure",
    name: "烟气静压计算",
    short: "静压",
    desc: "已知全压或静压，与动压、皮托管系数互相换算",
    icon: "layers",
    ref: "Excel 区块 4",
    fields: [F.pt(), F.ps(), F.dp(), F.kp()],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4, primary: true },
      { key: "pt", label: "烟气全压 Pt", unit: "kPa", formula: "Pt = Ps + Δp·Kp²/1000", digits: 4, primary: true },
      { key: "dpPressure", label: "动压折算压增量", unit: "kPa", formula: "Δp·Kp²/1000", digits: 4 },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, pt, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const dpPressure = isN(v.dp) && isN(v.kp) ? dpToPressure(v.dp, v.kp) : null;
      const steps: string[] = [];
      if (dpPressure !== null) {
        steps.push(`动压折算：Δp·Kp²/1000 = (${v.dp}/1000)×${v.kp}² = ${dpPressure.toFixed(4)} kPa`);
      }
      if (dpPressure !== null && ps !== null && pt !== null) {
        steps.push(from.startsWith("全压由") ? `Pt = Ps + ${dpPressure.toFixed(4)} = ${pt.toFixed(4)} kPa` : `Ps = Pt − ${dpPressure.toFixed(4)} = ${ps.toFixed(4)} kPa`);
      }
      return {
        values: { ps, pt, dpPressure },
        notes: { ps: from, pt: from },
        steps,
        // 结果直接回填到输入框：输入框即显示
        // 只有派生值回填（实测值保持用户输入），避免互相覆盖
        fills: pressureFills(v, measured, true, true, derived),
      };
    },
  },

  /* ---------- 2. 工况预测采样嘴直径选取计算 ---------- */
  {
    formulas: [
      { title: "采样嘴直径", lines: [
        "D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))",
        "Qrs' = 0.047 × D² × Vs × (1 − Xsw/100)（回代校核）",
      ] },
    ],
    id: "nozzle-select",
    name: "采样嘴直径选取",
    short: "采样嘴",
    desc: "由等速采样流量与烟气流速反算所需采样嘴直径",
    icon: "filter",
    ref: "Excel 区块 2",
    fields: [F.qrs(), F.vs(), F.xsw()],
    results: [
      { key: "nozzle", label: "采样嘴直径 D", unit: "mm", formula: "D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))", digits: 2, primary: true },
      { key: "check", label: "校核等速采样流量", unit: "L/min", formula: "Qrs' = 0.047 × D² × Vs × (1 − Xsw/100)", digits: 2 },
    ],
    compute(v) {
      const d = isN(v.qrs) && isN(v.vs) && isN(v.xsw) ? nozzleFromFlow(v.qrs, v.vs, v.xsw) : null;
      const check = d !== null && isN(v.vs) && isN(v.xsw) ? isokineticFlow(d, v.vs, v.xsw) : null;
      return {
        values: { nozzle: d, check },
        notes: { check: "应等于输入的等速采样流量" },
        steps: d !== null
          ? [`D = √(${v.qrs} / (0.047 × ${v.vs} × ${(1 - v.xsw! / 100).toFixed(4)})) = ${d.toFixed(2)} mm`]
          : [],
        fills: { nozzle: "nozzle" },
      };
    },
  },

  /* ---------- 3. 烟气流速计算 ---------- */
  {
    formulas: [
      { title: "压力与密度", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325",
      ] },
      { title: "流速", lines: [
        "Vs = 1.414 × Kp × √(Δp/ρ)",
      ] },
    ],
    id: "velocity",
    name: "烟气流速计算",
    short: "流速",
    desc: "由动压、皮托管系数与烟气密度（烟温/静压/大气压）计算烟气流速",
    icon: "wind",
    ref: "Excel 区块 3",
    fields: [F.dp(), F.kp(), F.temp(), F.ba(), F.ps(), F.pt()],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4 },
      { key: "pt", label: "烟气全压 Pt", unit: "kPa", formula: "Pt = Ps + Δp·Kp²/1000", digits: 4 },
      { key: "rho", label: "湿烟气密度 ρ", unit: "kg/m³", formula: "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
      { key: "vs", label: "烟气流速 Vs", unit: "m/s", formula: "Vs = 1.414 × Kp × √(Δp/ρ)", digits: 3, primary: true },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, pt, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;
      const rho = isN(v.temp) && isN(pAbs) ? flueGasDensity(v.temp, pAbs) : null;
      const vs = isN(v.dp) && isN(v.kp) && isN(rho) ? flueGasVelocity(v.dp, v.kp, rho) : null;
      const steps: string[] = [];
      if (rho !== null) steps.push(`ρ = 1.34 × ${(DUST_T0 / (DUST_T0 + v.temp!)).toFixed(5)} × ${(pAbs! / DUST_P0).toFixed(5)} = ${rho.toFixed(5)} kg/m³`);
      if (vs !== null) steps.push(`Vs = 1.414 × ${v.kp} × √(${v.dp}/${rho!.toFixed(5)}) = ${vs.toFixed(3)} m/s`);
      return {
        values: { ps, pt, vs, rho },
        notes: { ps: from, pt: from },
        steps,
        // Vs 回填到「烟气流速」输入框（输入框即显示）；全压/静压仅回填派生值
        fills: { ...pressureFills(v, measured, true, true, derived), vs: "vs" },
      };
    },
  },

  /* ---------- 4. 采样流量计算 ---------- */
  {
    formulas: [
      { title: "等速采样流量", lines: [
        "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)",
      ] },
    ],
    id: "sampling-flow",
    name: "采样流量计算",
    short: "采样流量",
    desc: "由采样嘴直径与烟气流速计算等速采样流量",
    icon: "calculator",
    ref: "Excel 区块 1",
    fields: [F.nozzle(), F.vs(), F.xsw()],
    results: [
      { key: "qrs", label: "等速采样流量 Qrs", unit: "L/min", formula: "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)", digits: 2, primary: true },
      { key: "qh", label: "等速采样流量", unit: "m³/h", formula: "Qrs ÷ 60 × 3600", digits: 0 },
    ],
    compute(v) {
      const qrs = isN(v.nozzle) && isN(v.vs) && isN(v.xsw) ? isokineticFlow(v.nozzle, v.vs, v.xsw) : null;
      const qh = qrs !== null ? qrs * 60 : null;
      return {
        values: { qrs, qh },
        notes: { qh: "Qrs(L/min) × 60 = m³/h" },
        steps: qrs !== null
          ? [`Qrs = 0.047 × ${v.nozzle}² × ${v.vs} × ${(1 - v.xsw! / 100).toFixed(4)} = ${qrs.toFixed(2)} L/min`]
          : [],
        fills: { qrs: "qrs" },
      };
    },
  },

  /* ---------- 5. 工况体积计算（两种模式） ---------- */
  {
    formulas: [
      { title: "压力换算", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
      ] },
      { title: "工况体积（两种方法）", lines: [
        "V = Qrs × n（烟温静压法）",
        "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n（计温计压法）",
      ] },
    ],
    id: "condition-volume",
    name: "工况体积计算",
    short: "工况体积",
    desc: "采样体积换算：烟温静压法（Qrs×n）或计温计压法",
    icon: "flask",
    ref: "Excel 区块 8",
    fields: [
      F.qrs(), F.minutes(), F.temp(), F.ba(), F.ps(), F.pt(), F.kp(), F.dp(),
      F.meterTemp(), F.meterP(),
    ],
    results: [
      { key: "volumeFlowTemp", label: "工况体积（烟温静压法）", unit: "L", formula: "V = Qrs × n", digits: 2, primary: true },
      { key: "volumeMeter", label: "工况体积（计温计压法）", unit: "L", formula: "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n", digits: 2, primary: true },
      { key: "diff", label: "两法差值", unit: "L", formula: "V − V′", digits: 2 },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;
      const meterPAbs = isN(v.ba) && isN(v.meterP) ? v.ba + v.meterP : null;
      const vFlowTemp = isN(v.qrs) && isN(v.minutes) ? volumeByFlowTime(v.qrs, v.minutes) : null;
      const vMeter = isN(v.qrs) && isN(v.minutes) && isN(pAbs) && isN(v.meterTemp) && isN(meterPAbs) && isN(v.temp)
        ? volumeByMeterCondition(v.qrs, v.minutes, pAbs, v.meterTemp, meterPAbs, v.temp)
        : null;
      const diff = vFlowTemp !== null && vMeter !== null ? vFlowTemp - vMeter : null;
      const steps: string[] = [];
      if (vFlowTemp !== null) steps.push(`V = Qrs × n = ${v.qrs} × ${v.minutes} = ${vFlowTemp.toFixed(2)} L`);
      if (vMeter !== null) {
        steps.push(
          `V' = ${v.qrs} × ${pAbs!.toFixed(3)}×${(DUST_T0 + v.meterTemp!).toFixed(2)} / ${meterPAbs!.toFixed(3)}×${(DUST_T0 + v.temp!).toFixed(2)} × ${v.minutes} = ${vMeter.toFixed(2)} L`
        );
      }
      return {
        values: { volumeFlowTemp: vFlowTemp, volumeMeter: vMeter, diff },
        notes: { ps: from },
        steps,
        fills: pressureFills(v, measured, true, true, derived),
      };
    },
  },

  /* ---------- 6. 标况采样体积计算 ---------- */
  {
    formulas: [
      { title: "压力换算", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
      ] },
      { title: "标况采样体积（标态干基）", lines: [
        "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)",
        "修正因子 = 273.15/(273.15+t) × (Ba+Ps)/101.325",
        "标况采样体积：0℃、101.325 kPa 标态干基口径",
      ] },
    ],
    id: "standard-volume",
    name: "标况采样体积计算",
    short: "标况体积",
    desc: "工况体积折算到标态（0℃、101.325 kPa）干基",
    icon: "flask",
    ref: "Excel 区块 5",
    fields: [F.volume(), F.temp(), F.ba(), F.ps(), F.pt(), F.kp(), F.dp(), F.xsw()],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4 },
      { key: "vnd", label: "标况采样体积 Vnd", unit: "L", formula: "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", digits: 2, primary: true },
      { key: "factor", label: "温度压力修正因子", unit: "", formula: "273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;
      const factor = isN(v.temp) && isN(pAbs) ? toStandardFactor(v.temp, pAbs) : null;
      const vnd = isN(v.volume) && isN(factor)
        ? toStandardVolume(v.volume, v.temp!, pAbs!) * dryFactor(v.xsw ?? 0)
        : null;
      const steps: string[] = [];
      if (factor !== null) steps.push(`修正因子 = ${(DUST_T0 / (DUST_T0 + v.temp!)).toFixed(5)} × ${(pAbs! / DUST_P0).toFixed(5)} = ${factor.toFixed(5)}`);
      if (vnd !== null) {
        steps.push(
          `Vnd = ${v.volume} × ${factor!.toFixed(5)} × ${(1 - (v.xsw ?? 0) / 100).toFixed(4)} = ${vnd.toFixed(2)} L（标态干基）`
        );
      }
      return {
        values: { ps, vnd, factor },
        notes: { ps: from, vnd: "标态干基" },
        steps,
        // Vnd 回填到「实际采样体积 V」输入框不合适（口径不同），
        // 只回填派生的静压值
        fills: pressureFills(v, measured, true, true, derived),
      };
    },
  },

  /* ---------- 7. 实际烟气流量计算 ---------- */
  {
    formulas: [
      { title: "实际烟气流量", lines: [
        "Qs = Vs × F × 3600",
      ] },
    ],
    id: "actual-flow",
    name: "实际烟气流量计算",
    short: "实际流量",
    desc: "由烟气流速与烟道截面积计算实际烟气流量",
    icon: "trendUp",
    ref: "Excel 区块 7",
    fields: [F.vs(), F.area()],
    results: [
      { key: "qs", label: "实际烟气流量 Qs", unit: "m³/h", formula: "Qs = Vs × F × 3600", digits: 0, primary: true },
      { key: "qsSec", label: "实际烟气流量", unit: "m³/s", formula: "Qs ÷ 3600", digits: 3 },
    ],
    compute(v) {
      const qs = isN(v.vs) && isN(v.area) ? flueGasFlow(v.vs, v.area) : null;
      return {
        values: { qs, qsSec: qs !== null ? qs / 3600 : null },
        notes: {},
        steps: qs !== null ? [`Qs = ${v.vs} × ${v.area} × 3600 = ${qs.toFixed(0)} m³/h`] : [],
        fills: { qs: "qactual" },
      };
    },
  },

  /* ---------- 8. 标干烟气流量计算 ---------- */
  {
    formulas: [
      { title: "压力换算", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
      ] },
      { title: "标干烟气流量", lines: [
        "Qn = Q × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)",
        "修正因子 = 273.15/(273.15+t) × (Ba+Ps)/101.325",
        "标干烟气流量：0℃、101.325 kPa 标态干基口径",
      ] },
    ],
    id: "standard-flow",
    name: "标干烟气流量计算",
    short: "标干流量",
    desc: "实际烟气流量折算到标态干基（0℃、101.325 kPa），用于排放速率计算",
    icon: "chart",
    ref: "Excel 区块 6",
    fields: [F.qactual(), F.temp(), F.ba(), F.ps(), F.pt(), F.kp(), F.dp(), F.xsw()],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4 },
      { key: "qn", label: "标干烟气流量 Qn", unit: "m³/h", formula: "Qn = Q × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", digits: 0, primary: true },
      { key: "factor", label: "温度压力修正因子", unit: "", formula: "273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;
      const factor = isN(v.temp) && isN(pAbs) ? toStandardFactor(v.temp, pAbs) : null;
      const qn = isN(v.qactual) && isN(factor)
        ? standardFlow(v.qactual, v.temp!, pAbs!, v.xsw ?? 0)
        : null;
      const steps: string[] = [];
      if (factor !== null) steps.push(`修正因子 = ${(DUST_T0 / (DUST_T0 + v.temp!)).toFixed(5)} × ${(pAbs! / DUST_P0).toFixed(5)} = ${factor.toFixed(5)}`);
      if (qn !== null) {
        steps.push(
          `Qn = ${v.qactual} × ${factor!.toFixed(5)} × ${(1 - (v.xsw ?? 0) / 100).toFixed(4)} = ${qn.toFixed(0)} m³/h（标态干基）`
        );
      }
      return {
        values: { ps, qn, factor },
        notes: { ps: from, qn: "标态干基" },
        steps,
        fills: pressureFills(v, measured, true, true, derived),
      };
    },
  },

  /* ---------- 9. 颗粒物浓度与排放速率（综合版） ---------- */
  {
    formulas: [
      { title: "压力与工况", lines: [
        "Ps = Pt − Δp·Kp²/1000",
        "P = Ba + Ps（烟气绝对压力）",
        "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325",
      ] },
      { title: "流速与采样", lines: [
        "Vs = 1.414 × Kp × √(Δp/ρ)",
        "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)",
        "V = Qrs × n（工况采样体积）",
      ] },
      { title: "标况体积与浓度（标态干基）", lines: [
        "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)",
        "C = (g2 − g1) / Vnd × 10⁶",
        "α = 21/(21 − O₂实测)；αs = 21/(21 − O₂基准)",
        "Cα = C × α/αs × 出力系数",
      ] },
      { title: "流量与排放", lines: [
        "Qs = Vs × F × 3600（实际烟气流量）",
        "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)（标干烟气流量）",
        "G = C × Qn × 10⁻⁶（颗粒物排放速率，kg/h）",
      ] },
    ],
    id: "full",
    name: "综合版（全链路）",
    short: "综合版",
    desc: "动压/静压/烟温 → 流速 → 等速流量 → 采样体积 → 浓度/折算/排放速率",
    icon: "chimney",
    ref: "全链路",
    fields: [
      F.dp(), F.ps(), F.pt(), F.temp(), F.ba(), F.xsw(), F.kp(), F.area(),
      F.nozzle(), F.minutes(), F.g1(), F.g2(),
      F.o2(), F.o2base(), F.load(),
      F.meterTemp(), F.meterP(),
    ],
    results: [
      { key: "ps", label: "烟气静压 Ps", unit: "kPa", formula: "Ps = Pt − Δp·Kp²/1000", digits: 4 },
      { key: "pt", label: "烟气全压 Pt", unit: "kPa", formula: "Pt = Ps + Δp·Kp²/1000", digits: 4 },
      { key: "rho", label: "湿烟气密度 ρ", unit: "kg/m³", formula: "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325", digits: 5 },
      { key: "vs", label: "烟气流速 Vs", unit: "m/s", formula: "Vs = 1.414 × Kp × √(Δp/ρ)", digits: 3 },
      { key: "qrs", label: "等速采样流量 Qrs", unit: "L/min", formula: "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)", digits: 2 },
      { key: "volumeWet", label: "工况采样体积 V", unit: "L", formula: "V = Qrs × n", digits: 2 },
      { key: "vnd", label: "标况采样体积 Vnd", unit: "L", formula: "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", digits: 2 },
      { key: "mass", label: "颗粒物净重 Δg", unit: "g", formula: "Δg = g2 − g1", digits: 4 },
      { key: "c", label: "颗粒物浓度 C", unit: "mg/m³", formula: "C = Δg / Vnd × 10⁶", digits: 2, primary: true },
      { key: "alpha", label: "过剩空气系数 α", unit: "", formula: "α = 21 / (21 − O₂实测)", digits: 4 },
      { key: "alphaS", label: "折算系数 αs", unit: "", formula: "αs = 21 / (21 − O₂基准)", digits: 4 },
      { key: "cadj", label: "折算浓度 Cα", unit: "mg/m³", formula: "Cα = C × α/αs × 出力系数", digits: 2, primary: true },
      { key: "qs", label: "实际烟气流量 Qs", unit: "m³/h", formula: "Qs = Vs × F × 3600", digits: 0 },
      { key: "qn", label: "标干烟气流量 Qn", unit: "m³/h", formula: "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", digits: 0 },
      { key: "g", label: "颗粒物排放速率 G", unit: "kg/h", formula: "G = C × Qn × 10⁻⁶", digits: 4, primary: true },
    ],
    compute(v, opts) {
      const measured = opts?.measured ?? null;
      const derived = opts?.derived ?? [];
      const { ps, pt, from } = resolvePressures(v.ps, v.pt, v.dp, v.kp, measured, derived);
      const pAbs = isN(v.ba) && isN(ps) ? v.ba + ps : null;
      const rho = isN(v.temp) && isN(pAbs) ? flueGasDensity(v.temp, pAbs) : null;
      const vs = isN(v.dp) && isN(v.kp) && isN(rho) ? flueGasVelocity(v.dp, v.kp, rho) : null;
      const qrs = isN(v.nozzle) && isN(vs) && isN(v.xsw) ? isokineticFlow(v.nozzle, vs, v.xsw) : null;
      const volumeWet = isN(qrs) && isN(v.minutes) ? volumeByFlowTime(qrs, v.minutes) : null;
      const vnd = isN(volumeWet) && isN(v.temp) && isN(pAbs)
        ? toStandardVolume(volumeWet, v.temp, pAbs) * dryFactor(v.xsw ?? 0)
        : null;
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

      const steps: string[] = [];
      if (rho !== null) steps.push(`ρ = ${rho.toFixed(5)} kg/m³`);
      if (vs !== null) steps.push(`Vs = ${vs.toFixed(3)} m/s`);
      if (qrs !== null) steps.push(`Qrs = ${qrs.toFixed(2)} L/min`);
      if (volumeWet !== null) steps.push(`V = Qrs × n = ${volumeWet.toFixed(2)} L`);
      if (vnd !== null) steps.push(`Vnd = ${vnd.toFixed(2)} L（标态干基）`);
      if (mass !== null) steps.push(`Δg = ${mass.toFixed(4)} g`);
      if (c !== null) steps.push(`C = ${c.toFixed(2)} mg/m³`);
      if (cadj !== null) steps.push(`Cα = ${cadj.toFixed(2)} mg/m³`);
      if (qs !== null) steps.push(`Qs = ${qs.toFixed(0)} m³/h`);
      if (qn !== null) steps.push(`Qn = ${qn.toFixed(0)} m³/h`);
      if (g !== null) steps.push(`G = C × Qn × 10⁻⁶ = ${g.toFixed(4)} kg/h`);

      return {
        values: {
          ps, pt, rho, vs, qrs, volumeWet, vnd, mass, c,
          alpha, alphaS, cadj, qs, qn, g,
        },
        notes: {
          ps: from,
          pt: from,
          vnd: "标态干基",
          c: "标态干基浓度",
          qn: "标态干基",
        },
        steps,
        // 全压↔静压：派生值回填输入框（输入框即显示）
        fills: pressureFills(v, measured, true, true, derived),
      };
    },
  },
];

/* ==================================================================
 *  统一后处理：裁剪 fills 中指向不存在输入框 / 未声明结果的映射
 * ================================================================== */
for (const mode of DUST_MODES) {
  const raw = mode.compute;
  const fieldKeys = new Set(mode.fields.map((f) => f.key));
  const resKeys = new Set(mode.results.map((r) => r.key));
  mode.compute = (v, opts) => {
    const out = raw(v, opts);
    if (!out.fills) return out;
    const pruned: Record<string, string> = {};
    for (const [resKey, fieldKey] of Object.entries(out.fills)) {
      if (fieldKeys.has(fieldKey) && resKeys.has(resKey)) pruned[resKey] = fieldKey;
    }
    return { ...out, fills: Object.keys(pruned).length ? pruned : undefined };
  };
}

/** 模式 id → 模式 */
export const DUST_MODE_MAP: Record<string, DustMode> = Object.fromEntries(
  DUST_MODES.map((m) => [m.id, m])
);

/** 各模式示例数据（填入示例按钮使用） */
export const DUST_MODE_DEMO: Record<string, Record<string, number | null>> = {
  "static-pressure": { pt: 0.06, ps: null, dp: 25, kp: 0.84 },
  "nozzle-select": { qrs: 36.41, vs: 5.4, xsw: 0.38 },
  "velocity": { dp: 25, kp: 0.84, temp: 31.8, ba: 101.9, ps: 0.01, pt: 0.06 },
  "sampling-flow": { nozzle: 12, vs: 5.4, xsw: 0.38 },
  "condition-volume": {
    qrs: 36.41, minutes: 120, temp: 158.7, ba: 97.6, ps: -0.19, pt: null,
    kp: 0.84, dp: 25, meterTemp: 39.2, meterP: -3.38,
  },
  "standard-volume": {
    volume: 2068.2, temp: 158.7, ba: 97.6, ps: -0.19, pt: null,
    kp: 0.84, dp: 25, xsw: 1.31,
  },
  "actual-flow": { vs: 17.3, area: 7.28 },
  "standard-flow": {
    qactual: 2579, temp: 32, ba: 101.9, ps: 0.01, pt: null,
    kp: 0.84, dp: 25, xsw: 1.31,
  },
  full: {
    dp: 71, ps: -0.04, pt: null, temp: 93.4, ba: 101.9, xsw: 7.89,
    kp: 0.84, area: 1.7671, nozzle: 8, minutes: 45,
    g1: 10.13587, g2: 10.15447, o2: 14.2, o2base: 9, load: 1,
    meterTemp: null, meterP: null,
  },
};

/* ==================================================================
 *  三、缺失项推导（平台与小程序共用）
 * ================================================================== */

/**
 * 中央依赖规则表：结果 key → 依赖表达式
 *  - "field"    需要该输入字段有值
 *  - "a+b"      组内全部需要
 *  - "a|b"      组内任一满足即可
 *  - "@key"     需要先算出该结果（结果依赖）
 */
export const DUST_DEP_RULES: Record<string, string[]> = {
  // —— 压力组 ——
  ps: ["ps|pt+dp+kp"],
  pt: ["pt|ps+dp+kp"],
  dpPressure: ["dp+kp"],
  pressureAbs: ["ba", "ps|pt+dp+kp"],
  // —— 工况与流速 ——
  rho: ["temp", "ba", "ps|pt+dp+kp"],
  vs: ["dp", "kp", "temp", "ba", "ps|pt+dp+kp"],
  // —— 采样 ——
  qrs: ["nozzle", "vs"],
  nozzle: ["qrs", "vs", "xsw"],
  check: ["nozzle"],
  qh: ["qrs"],
  volumeFlowTemp: ["qrs", "minutes"],
  volumeMeter: ["qrs", "minutes", "ba", "ps|pt+dp+kp", "temp", "meterTemp", "meterP"],
  diff: ["@volumeFlowTemp", "@volumeMeter"],
  volumeWet: ["qrs", "minutes"],
  vnd: ["volume", "temp", "ba", "ps|pt+dp+kp", "xsw"],
  factor: ["temp", "ba", "ps|pt+dp+kp"],
  // —— 流量 ——
  qs: ["vs", "area"],
  qsSec: ["vs", "area"],
  qn: ["qactual", "temp", "ba", "ps|pt+dp+kp", "xsw"],
  // —— 浓度与排放 ——
  mass: ["g1", "g2"],
  c: ["g1", "g2", "nozzle", "dp", "kp", "temp", "ba", "ps|pt+dp+kp", "minutes", "xsw"],
  alpha: ["o2"],
  alphaS: ["o2base"],
  cadj: ["g1", "g2", "o2", "o2base", "load"],
  g: ["g1", "g2", "dp", "kp", "temp", "ba", "ps|pt+dp+kp", "area", "xsw"],
};

/** 字段 key → 显示名（用于缺失提示） */
const FIELD_LABEL: Record<string, string> = {
  dp: "平均动压 Δp", ps: "平均静压 Ps", pt: "烟气全压 Pt", temp: "平均烟温 t",
  ba: "大气压 Ba", xsw: "含湿量 Xsw", kp: "皮托管系数 Kp", area: "烟道截面积 F",
  nozzle: "采样嘴直径 d", qrs: "等速采样流量 Qrs", minutes: "累计采样时长 n",
  volume: "实际采样体积 V", vs: "烟气流速 Vs", qactual: "实际烟气流量 Q",
  meterTemp: "计温 t′", meterP: "计压 P′", g1: "滤筒初重 g1", g2: "滤筒终重 g2",
  o2: "实测 O₂ 浓度", o2base: "基准含氧量", load: "负荷（出力）系数",
};

/** 结果 key → 显示名 */
const RESULT_LABEL: Record<string, string> = {
  volumeFlowTemp: "工况体积（烟温静压法）", volumeMeter: "工况体积（计温计压法）",
  ps: "烟气静压 Ps", pt: "烟气全压 Pt", rho: "湿烟气密度 ρ", vs: "烟气流速 Vs",
  qrs: "等速采样流量 Qrs", nozzle: "采样嘴直径 D", check: "校核等速采样流量",
  qh: "等速采样流量", volumeWet: "工况采样体积 V", vnd: "标况采样体积 Vnd",
  factor: "温度压力修正因子", qs: "实际烟气流量 Qs", qsSec: "实际烟气流量",
  qn: "标干烟气流量 Qn", mass: "颗粒物净重 Δg", c: "颗粒物浓度 C",
  alpha: "过剩空气系数 α", alphaS: "折算系数 αs", cadj: "折算浓度 Cα",
  g: "颗粒物排放速率 G", dpPressure: "动压折算压增量",
};

/**
 * 缺失项推导：给定输入值与已算出结果，返回缺失说明文本（空串 = 已算出）
 * @param resultKey 结果 key
 * @param v        当前输入值映射
 * @param computed 已算出的结果值映射（用于 @key 依赖）
 */
export function missingOfResult(
  resultKey: string,
  v: Record<string, number | null>,
  computed: Record<string, number | null>
): string {
  const rules = DUST_DEP_RULES[resultKey];
  if (!rules) return "";

  const hasField = (k: string) => {
    const val = v[k];
    return typeof val === "number" && isFinite(val);
  };
  const hasResult = (k: string) => {
    const val = computed[k];
    return typeof val === "number" && isFinite(val);
  };

  const miss: string[] = [];
  for (const rule of rules) {
    // "@key"：结果依赖
    if (rule.startsWith("@")) {
      const k = rule.slice(1);
      if (!hasResult(k)) miss.push(RESULT_LABEL[k] || k);
      continue;
    }
    // 规则含 "|"：左右两组满足任一即可（每组内部用 "+" 表示全需）
    if (rule.includes("|")) {
      const groups = rule.split("|").map((g) => g.split("+").filter(Boolean));
      const anyOk = groups.some((grp) => grp.every(hasField));
      if (!anyOk) {
        // 报最接近的一组缺失项（取第一组）
        const grp = groups[0];
        const lack = grp.filter((f) => !hasField(f));
        miss.push(lack.map((f) => FIELD_LABEL[f] || f).join("、"));
      }
      continue;
    }
    // 规则含 "+"：组内全部需要
    if (rule.includes("+")) {
      const parts = rule.split("+").filter(Boolean);
      const lack = parts.filter((f) => !hasField(f));
      if (lack.length) miss.push(lack.map((f) => FIELD_LABEL[f] || f).join("、"));
      continue;
    }
    // 单字段
    if (!hasField(rule)) miss.push(FIELD_LABEL[rule] || rule);
  }

  if (miss.length === 0) return "";
  // 去重
  const uniq = Array.from(new Set(miss));
  return "缺 " + uniq.join("、");
}
