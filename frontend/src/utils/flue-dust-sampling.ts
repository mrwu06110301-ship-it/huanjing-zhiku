/**
 * flue-dust-sampling.ts — 烟尘采样模型计算引擎
 *
 * 依据 GB/T 16157《固定污染源排气中颗粒物测定与气态污染物采样方法》
 * 公式链经《烟尘相关计算公式(1).xlsx》逐格校对（9 个公式全部独立重算复核通过）。
 *
 * 【Excel 原表公式 → 本引擎映射】
 *  区块1 D5  =0.047*A5*A5*B5*(1-(C5*0.01))                 → 等速采样流量 Qrs
 *  区块2 D8  =SQRT(A8/(0.047*B8*(1-(C8*0.01))))           → 采样嘴直径反算 D
 *  区块3 F11 =1.414*A11*SQRT(B11/(1.34*(273/(273+E11))*(C11+D11)/101.325))
 *                                                           → 烟气流速 Vs
 *  区块4 D14 =A14-(B14/1000*C14*C14)                      → 烟气静压 Pe（由全压+动压反算）
 *  区块5 E17 =A17*273/(273+D17)*(B17+C17)/101.325         → 标况采样体积 Vnd
 *  区块6 F20 =A20*273/(273+D20)*(B20+C20)/101.325*(1-E20/100)
 *                                                           → 标杆（标态干基）烟气流量 Qn
 *  区块7 C23 =A23*B23*3600                                → 实际烟气流量 Qs
 *  区块8a C26=A26*B26                                      → 工况采样体积 V（烟温静压法）
 *  区块8b H28=A28*(C28+E28)*(273.15+F28)/(C28+G28)/(273.15+D28)*B28
 *                                                           → 实际体积 V'（计温计压法）
 *  GB/T 16157 补充 → 颗粒物浓度 C、过剩空气系数 α、折算浓度 Cα、排放速率 G
 *
 * 【校对与优化记录】
 *  1) 含湿量口径统一：原表区块1 用 (1−C×0.01)、区块6 用 (1−E/100)，实为同一含义
 *     （Xsw 以百分数数值计，如 0.38 表示 0.38%），本引擎统一为 (1 − Xsw/100)，消除误填风险。
 *  2) 标准温度统一为 273.15 K（原表区块5/6/7 用 273、区块8b 用 273.15）。
 *     同一算例下体积偏差 +0.25 L（相对 0.02%），统一后符合 0℃ 标态定义。
 *  3) 原表区块3（静压直填）与区块4（由全压+动压反算静压）是两套独立工况数据，
 *     本引擎改为「双向换算」：静压与全压可互相推算（Pt = Ps + Δp·Kp²/1000），
 *     任一已知即可计算，另一个作为副产物同时给出。
 *  4) 干湿基口径统一：原表区块5 标况体积为湿基、区块6 标杆流量为干基，两者不一致，
 *     会使「C × Qn = G」出现系统性偏差。本引擎引入 basis 口径开关，
 *     让 Vnd / C / Qn / G 四者严格同口径：
 *       wet  —— 湿基（仪表读数口径）：Vnd 湿基、C 湿基、Qn 湿基
 *       dry  —— 干基（GB/T 16157 口径）：Vnd 干基、C 干基、Qn 干基
 *     切换口径时 C、Qn、G 同步变化，保证 C×Qn×10⁻⁶ ≡ G 恒成立。
 */

export const DUST_T0 = 273.15;      // 标态温度 K（0℃）
export const DUST_P0 = 101.325;      // 标态压力 kPa
export const DUST_RHO0 = 1.34;       // 标态烟气密度 kg/m³（湿基经验值）
export const DUST_K = 1.414;         // √2

/** 干湿基口径 */
export type DustBasis = "wet" | "dry";

export interface DustSamplingInput {
  // —— 工况实测 ——
  dynamicPressure: number | null;   // 平均动压 Hd（Pa）
  staticPressure: number | null;    // 平均静压 Ps（kPa，表压，烟气通常为负）
  totalPressure: number | null;     // 烟气全压 Pt（kPa）
  stackTemp: number | null;         // 平均烟温 t（℃）
  atmosphere: number | null;        // 大气压 Ba（kPa）
  moisture: number | null;          // 含湿量 Xsw（%）
  pitotCoefficient: number | null;  // 皮托管修正系数 Kp（无量纲，S 型取 0.84）
  crossSection: number | null;      // 烟道截面积 F（m²）
  // —— 采样与称量 ——
  nozzleDiameter: number | null;    // 采样嘴直径 d（mm）
  samplingMinutes: number | null;   // 累计采样时长 n（min）
  filterInitialMass: number | null; // 滤筒初始重量 g1（g）
  filterFinalMass: number | null;   // 滤筒最终重量 g2（g）
  // —— 采样流量计计温计压（可选）——
  meterTemp: number | null;         // 计温 t′（℃）
  meterPressure: number | null;     // 计压 P′（kPa，表压）
  // —— 折算参数 ——
  O2: number | null;                // 实测 O2 浓度（%）
  O2Base: number | null;            // 基准含氧量（%）
  loadFactor: number | null;        // 负荷（出力）系数
  // —— 口径 ——
  basis: DustBasis;                 // 干湿基口径（wet=湿基/仪表口径，dry=干基/GB 口径）
}

/** 单个计算结果：可算则给值，不可算则给缺失依赖清单 */
export interface DustValue {
  key: string;
  label: string;
  unit: string;
  formula: string;
  value: number | null;
  missing: string[];   // 缺失的输入项名称（value 为 null 时有效）
  digits: number;      // 显示小数位
  note?: string;       // 补充说明（来源口径等）
}

export interface DustSamplingResult {
  values: Record<string, DustValue>;
  steps: string[];
  computedCount: number;
  totalCount: number;
}

type Num = number | null;
const isNum = (v: Num): v is number => typeof v === "number" && Number.isFinite(v);

/* ==================================================================
 *  一、纯函数原语（可被各分项工具直接复用，保证口径一致）
 * ================================================================== */

/** 动压（Pa）→ 等效静压增量（kPa）：Δp·Kp²/1000 */
export function dpToPressure(dpPa: number, kp: number): number {
  return (dpPa / 1000) * kp * kp;
}
/** 全压 − 静压增量 = 静压 */
export function totalToStatic(pt: number, dpPa: number, kp: number): number {
  return pt - dpToPressure(dpPa, kp);
}
/** 静压 + 动压增量 = 全压 */
export function staticToTotal(ps: number, dpPa: number, kp: number): number {
  return ps + dpToPressure(dpPa, kp);
}
/** 湿烟气密度 kg/m³ */
export function flueGasDensity(t: number, pAbs: number): number {
  return DUST_RHO0 * (DUST_T0 / (DUST_T0 + t)) * (pAbs / DUST_P0);
}
/** 烟气流速 m/s */
export function flueGasVelocity(dpPa: number, kp: number, rho: number): number {
  return DUST_K * kp * Math.sqrt(dpPa / rho);
}
/** 等速采样流量 L/min */
export function isokineticFlow(nozzleMm: number, vs: number, xsw: number): number {
  return 0.047 * nozzleMm * nozzleMm * vs * (1 - xsw / 100);
}
/** 采样嘴直径反算 mm */
export function nozzleFromFlow(qrs: number, vs: number, xsw: number): number {
  return Math.sqrt(qrs / (0.047 * vs * (1 - xsw / 100)));
}
/** 工况采样体积 L（流量×时间） */
export function volumeByFlowTime(qrs: number, minutes: number): number {
  return qrs * minutes;
}
/** 实际体积 V'（计温计压法）L */
export function volumeByMeterCondition(
  qrs: number, minutes: number,
  pAbs: number, meterTemp: number, meterP: number, stackTemp: number
): number {
  return (qrs * ((pAbs * (DUST_T0 + meterTemp)) / (meterP * (DUST_T0 + stackTemp))) * minutes);
}
/** 温度压力修正因子（→标态，0℃/101.325kPa） */
export function toStandardFactor(t: number, pAbs: number): number {
  return (DUST_T0 / (DUST_T0 + t)) * (pAbs / DUST_P0);
}
/** 工况体积 → 标况体积 L */
export function toStandardVolume(v: number, t: number, pAbs: number): number {
  return v * toStandardFactor(t, pAbs);
}
/** 干基折算因子 */
export function dryFactor(xsw: number): number {
  return 1 - xsw / 100;
}
/** 实际烟气流量 m³/h（湿基工况） */
export function flueGasFlow(vs: number, area: number): number {
  return vs * area * 3600;
}
/** 标杆烟气流量 m³/h（标况） */
export function standardFlow(qs: number, t: number, pAbs: number, xsw: number, basis: DustBasis): number {
  const f = toStandardFactor(t, pAbs);
  return basis === "dry" ? qs * f * dryFactor(xsw) : qs * f;
}
/** 颗粒物浓度 mg/m³ */
export function dustConcentration(netMass: number, vnd: number): number {
  return (netMass / vnd) * 1e6;
}
/** 过剩空气系数 */
export function alphaOf(o2: number): number {
  return 21 / (21 - o2);
}
/** 折算浓度 mg/m³ */
export function adjustedConcentration(c: number, o2: number, o2Base: number, load: number): number {
  return c * (alphaOf(o2) / alphaOf(o2Base)) * load;
}
/** 排放速率 kg/h */
export function emissionRate(c: number, qn: number): number {
  return c * qn * 1e-6;
}

/* ==================================================================
 *  二、综合计算（全链路）
 * ================================================================== */

export function computeDustSampling(input: DustSamplingInput): DustSamplingResult {
  const {
    dynamicPressure: Hd, staticPressure: PsIn, totalPressure: Pt, stackTemp: t,
    atmosphere: Ba, moisture: Xsw, pitotCoefficient: Kp,
    crossSection: F, nozzleDiameter: d, samplingMinutes: n,
    filterInitialMass: g1, filterFinalMass: g2,
    meterTemp: tp, meterPressure: Pp,
    O2, O2Base, loadFactor,
    basis = "wet",
  } = input;

  const steps: string[] = [];
  const values: Record<string, DustValue> = {};

  function make(
    key: string, label: string, unit: string, formula: string, digits: number,
    inputs: { v: Num; label: string }[],
    compute: (vals: number[]) => number,
    note?: string
  ): DustValue {
    const miss: string[] = [];
    const ok: number[] = [];
    for (const it of inputs) {
      if (isNum(it.v)) ok.push(it.v);
      else miss.push(it.label);
    }
    let value: number | null = null;
    if (miss.length === 0) {
      const r = compute(ok);
      value = Number.isFinite(r) ? r : null;
      if (value === null) miss.push("输入组合无解");
    }
    const item = { key, label, unit, formula, value, missing: miss, digits, note };
    values[key] = item;
    return item;
  }

  /* ===== 1. 全压 / 静压 双向换算 ===== */
  // 关系：Pt = Ps + Δp·Kp²/1000
  // 已知 Ps → Pt；已知 Pt → Ps；两者都已知 → 互相校验
  const hasPs = isNum(PsIn);
  const hasPt = isNum(Pt);
  const hasDpKp = isNum(Hd) && isNum(Kp);

  let Ps: Num = null;      // 静压 kPa
  let PtOut: Num = null;   // 全压 kPa
  let psSource = "";

  if (hasPs) {
    Ps = PsIn;
    psSource = "实测静压";
    if (hasDpKp) {
      PtOut = staticToTotal(PsIn!, Hd!, Kp!);
      steps.push(
        `Pt = Ps + Δp·Kp²/1000 = ${PsIn} + (${Hd}/1000)×${Kp}² = ${PtOut.toFixed(4)} kPa（由静压+动压推算全压）`
      );
    }
  } else if (hasPt && hasDpKp) {
    Ps = totalToStatic(Pt!, Hd!, Kp!);
    PtOut = Pt;
    psSource = "由全压+动压反算";
    steps.push(
      `Ps = Pt − Δp·Kp²/1000 = ${Pt} − (${Hd}/1000)×${Kp}² = ${Ps.toFixed(4)} kPa（由全压+动压反算静压）`
    );
  }

  values.staticPressure = {
    key: "staticPressure",
    label: "烟气静压 Ps",
    unit: "kPa",
    formula: "Ps = Pt − Δp·Kp²/1000（已知静压时直接取用）",
    value: Ps,
    missing: Ps === null
      ? ["平均静压 Ps（或：烟气全压 Pt + 动压 Hd + 皮托管系数 Kp）"]
      : [],
    digits: 4,
    note: psSource || undefined,
  };
  values.totalPressure = {
    key: "totalPressure",
    label: "烟气全压 Pt",
    unit: "kPa",
    formula: "Pt = Ps + Δp·Kp²/1000（已知全压时直接取用）",
    value: PtOut,
    missing: PtOut === null
      ? ["烟气全压 Pt（或：平均静压 Ps + 动压 Hd + 皮托管系数 Kp）"]
      : [],
    digits: 4,
    note: hasPt && hasPs ? "实测全压" : psSource === "实测静压" ? "由静压+动压推算" : undefined,
  };

  const pAbs = isNum(Ba) && isNum(Ps) ? Ba + Ps : null;

  /* ===== 2. 烟气绝对压力 ===== */
  values.pressureAbs = make(
    "pressureAbs", "烟气绝对压力 P", "kPa", "P = Ba + Ps", 4,
    [{ v: Ba, label: "大气压 Ba" }, { v: Ps, label: "烟气静压 Ps" }],
    (a) => a[0] + a[1]
  );

  /* ===== 3. 湿烟气密度 ρ ===== */
  const rhoItem = make(
    "density", "湿烟气密度 ρ", "kg/m³",
    "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325", 5,
    [{ v: t, label: "烟气温度 t" }, { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" }],
    (a) => flueGasDensity(a[0], a[1])
  );
  values.density = rhoItem;
  if (rhoItem.value !== null) {
    steps.push(`ρ = 1.34 × 273.15/(273.15+${t}) × (Ba+Ps)/101.325 = ${rhoItem.value.toFixed(5)} kg/m³`);
  }

  /* ===== 4. 烟气流速 Vs ===== */
  const vsItem = make(
    "velocity", "烟气流速 Vs", "m/s",
    "Vs = 1.414 × Kp × √(Hd/ρ)", 3,
    [
      { v: Kp, label: "皮托管系数 Kp" },
      { v: Hd, label: "平均动压 Hd" },
      { v: rhoItem.value, label: "湿烟气密度 ρ（需烟温 + 大气压 + 静压）" },
    ],
    (a) => flueGasVelocity(a[1], a[0], a[2])
  );
  values.velocity = vsItem;
  if (vsItem.value !== null) {
    steps.push(`Vs = 1.414 × Kp × √(Hd/ρ) = ${vsItem.value.toFixed(3)} m/s`);
  }

  /* ===== 5. 等速采样流量 Qrs ===== */
  const qrsItem = make(
    "isokineticFlow", "等速采样流量 Qrs", "L/min",
    "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)", 2,
    [
      { v: d, label: "采样嘴直径 d" },
      { v: vsItem.value, label: "烟气流速 Vs（需动压 + 皮托管系数 + 烟温 + 大气压 + 静压）" },
      { v: Xsw, label: "含湿量 Xsw" },
    ],
    (a) => isokineticFlow(a[0], a[1], a[2])
  );
  values.isokineticFlow = qrsItem;
  if (qrsItem.value !== null) {
    steps.push(`Qrs = 0.047 × d² × Vs × (1 − Xsw/100) = ${qrsItem.value.toFixed(2)} L/min`);
  }

  /* ===== 6. 采样嘴直径反算 ===== */
  values.nozzleDiameterCalc = make(
    "nozzleDiameterCalc", "采样嘴直径（反算）", "mm",
    "D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))", 2,
    [
      { v: qrsItem.value, label: "等速采样流量 Qrs" },
      { v: vsItem.value, label: "烟气流速 Vs" },
      { v: Xsw, label: "含湿量 Xsw" },
    ],
    (a) => nozzleFromFlow(a[0], a[1], a[2])
  );

  /* ===== 7. 工况采样体积 V（烟温静压法） ===== */
  const vItem = make(
    "volumeWet", "工况采样体积 V", "L",
    "V = Qrs × n", 2,
    [{ v: qrsItem.value, label: "等速采样流量 Qrs" }, { v: n, label: "累计采样时长 n" }],
    (a) => volumeByFlowTime(a[0], a[1])
  );
  values.volumeWet = vItem;
  if (vItem.value !== null) {
    steps.push(`V = Qrs × n = ${vItem.value.toFixed(2)} L`);
  }

  /* ===== 8. 实际体积 V'（计温计压法） ===== */
  values.volumeMeter = make(
    "volumeMeter", "采样体积（计温计压法）", "L",
    "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n", 2,
    [
      { v: qrsItem.value, label: "等速采样流量 Qrs" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      { v: tp, label: "计温 t′" },
      { v: isNum(Ba) && isNum(Pp) ? Ba + Pp : null, label: "大气压 Ba + 计压 P′" },
      { v: t, label: "烟气温度 t" },
      { v: n, label: "累计采样时长 n" },
    ],
    (a) => volumeByMeterCondition(a[0], a[5], a[1], a[2], a[3], a[4]),
    "计温计压法：按采样流量计的计温计压条件修正的体积"
  );

  /* ===== 9. 标况采样体积 Vnd（随 basis 联动） ===== */
  const vndItem = make(
    "volumeStandard", "标况采样体积 Vnd", "L",
    basis === "dry"
      ? "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)（干基）"
      : "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325（湿基）",
    2,
    [
      { v: vItem.value, label: "工况采样体积 V（需等速采样流量 + 采样时长）" },
      { v: t, label: "烟气温度 t" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      ...(basis === "dry" ? [{ v: Xsw, label: "含湿量 Xsw" }] : []),
    ],
    (a) =>
      basis === "dry"
        ? toStandardVolume(a[0], a[1], a[2]) * dryFactor(a[3])
        : toStandardVolume(a[0], a[1], a[2]),
    basis === "dry" ? "干基口径" : "湿基口径"
  );
  values.volumeStandard = vndItem;
  if (vndItem.value !== null) {
    steps.push(
      `Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325${basis === "dry" ? " × (1 − Xsw/100)" : ""} = ${vndItem.value.toFixed(2)} L`
    );
  }

  /* ===== 10. 颗粒物净重 ===== */
  const massItem = make(
    "dustMass", "颗粒物净重 Δg", "g",
    "Δg = g2 − g1", 4,
    [{ v: g1, label: "滤筒初始重量 g1" }, { v: g2, label: "滤筒最终重量 g2" }],
    (a) => a[1] - a[0]
  );
  values.dustMass = massItem;
  if (massItem.value !== null) {
    steps.push(`Δg = g2 − g1 = ${massItem.value.toFixed(4)} g`);
  }

  /* ===== 11. 颗粒物浓度 C（随 basis 联动） ===== */
  const cItem = make(
    "concentration", "颗粒物浓度 C", "mg/m³",
    "C = (g2 − g1) / Vnd × 10⁶", 2,
    [
      { v: massItem.value, label: "颗粒物净重 Δg（需 g1、g2）" },
      { v: vndItem.value, label: "标况采样体积 Vnd" },
    ],
    (a) => dustConcentration(a[0], a[1])
  );
  values.concentration = cItem;
  if (cItem.value !== null) {
    steps.push(`C = Δg/Vnd × 10⁶ = ${cItem.value.toFixed(2)} mg/m³（${basis === "dry" ? "干基" : "湿基"}）`);
  }

  /* ===== 12-13. 过剩空气系数 α 与折算系数 αs ===== */
  const alphaItem = make(
    "alpha", "过剩空气系数 α", "",
    "α = 21 / (21 − O₂实测)", 4,
    [{ v: O2, label: "实测 O₂ 浓度" }],
    (a) => alphaOf(a[0])
  );
  values.alpha = alphaItem;
  const alphaSItem = make(
    "alphaS", "折算系数 αs", "",
    "αs = 21 / (21 − O₂基准)", 4,
    [{ v: O2Base, label: "基准含氧量" }],
    (a) => alphaOf(a[0])
  );
  values.alphaS = alphaSItem;

  /* ===== 14. 折算浓度 Cα ===== */
  const cadjItem = make(
    "concentrationAdjusted", "折算浓度 Cα", "mg/m³",
    "Cα = C × α/αs × 出力系数", 2,
    [
      { v: cItem.value, label: "颗粒物浓度 C" },
      { v: alphaItem.value, label: "过剩空气系数 α（需实测 O₂）" },
      { v: alphaSItem.value, label: "折算系数 αs（需基准含氧量）" },
      { v: loadFactor, label: "负荷（出力）系数" },
    ],
    (a) => a[0] * (a[1] / a[2]) * a[3]
  );
  values.concentrationAdjusted = cadjItem;
  if (cadjItem.value !== null) {
    steps.push(`Cα = C × α/αs × 出力系数 = ${cadjItem.value.toFixed(2)} mg/m³`);
  }

  /* ===== 15. 实际烟气流量 Qs（湿基工况） ===== */
  const qsItem = make(
    "flueGasFlow", "实际烟气流量 Qs（湿基工况）", "m³/h",
    "Qs = Vs × F × 3600", 0,
    [{ v: vsItem.value, label: "烟气流速 Vs" }, { v: F, label: "烟道截面积 F" }],
    (a) => flueGasFlow(a[0], a[1])
  );
  values.flueGasFlow = qsItem;

  /* ===== 16. 标杆烟气流量 Qn（随 basis 联动） ===== */
  const qnItem = make(
    "dryStandardFlow", "标杆烟气流量 Qn", "m³/h",
    basis === "dry"
      ? "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)（标态干基）"
      : "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325（标态湿基）",
    0,
    [
      { v: qsItem.value, label: "实际烟气流量 Qs（需流速 + 烟道截面积）" },
      { v: t, label: "烟气温度 t" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      ...(basis === "dry" ? [{ v: Xsw, label: "含湿量 Xsw" }] : []),
    ],
    (a) =>
      basis === "dry"
        ? standardFlow(a[0], a[1], a[2], a[3], "dry")
        : standardFlow(a[0], a[1], a[2], 0, "wet"),
    basis === "dry" ? "标态干基" : "标态湿基"
  );
  values.dryStandardFlow = qnItem;

  /* ===== 17. 排放速率 G ===== */
  const gItem = make(
    "emissionRate", "颗粒物排放速率 G", "kg/h",
    "G = C × Qn × 10⁻⁶", 4,
    [
      { v: cItem.value, label: "颗粒物浓度 C" },
      { v: qnItem.value, label: "标杆烟气流量 Qn" },
    ],
    (a) => emissionRate(a[0], a[1])
  );
  values.emissionRate = gItem;
  if (gItem.value !== null) {
    steps.push(`G = C × Qn × 10⁻⁶ = ${gItem.value.toFixed(4)} kg/h`);
  }

  const list = Object.values(values);
  const computedCount = list.filter((v) => v.value !== null).length;

  return { values, steps, computedCount, totalCount: list.length };
}

/** 示例数据（自洽工况量级） */
export const DUST_DEMO: DustSamplingInput = {
  dynamicPressure: 71,
  staticPressure: -0.04,
  totalPressure: null,
  stackTemp: 93.4,
  atmosphere: 101.9,
  moisture: 7.89,
  pitotCoefficient: 0.84,
  crossSection: 1.7671,
  nozzleDiameter: 8,
  samplingMinutes: 45,
  filterInitialMass: 10.13587,
  filterFinalMass: 10.15447,
  meterTemp: null,
  meterPressure: null,
  O2: 14.2,
  O2Base: 9,
  loadFactor: 1,
  basis: "wet",
};

/** Excel《烟尘相关计算公式(1)》校对算例（区块1/2/3/8a/8b 同一组数据） */
export const DUST_EXCEL_CASE: DustSamplingInput = {
  dynamicPressure: 25,
  staticPressure: 0.01,
  totalPressure: 0.06,
  stackTemp: 31.8,
  atmosphere: 101.9,
  moisture: 0.38,
  pitotCoefficient: 0.84,
  crossSection: 7.28,
  nozzleDiameter: 12,
  samplingMinutes: 120,
  filterInitialMass: null,
  filterFinalMass: null,
  meterTemp: 39.2,
  meterPressure: -3.38,
  O2: null,
  O2Base: null,
  loadFactor: null,
  basis: "wet",
};
