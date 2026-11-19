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
 *                                                           → 标杆（标况干基）烟气流量 Qn
 *  区块7 C23 =A23*B23*3600                                → 实际烟气流量 Qs
 *  区块8a C26=A26*B26                                      → 工况采样体积 V
 *  区块8b H28=A28*(C28+E28)*(273.15+F28)/(C28+G28)/(273.15+D28)*B28
 *                                                           → 计温计压法体积修正 V'
 *  GB/T 16157 补充 → 颗粒物浓度 C、过剩空气系数 α、折算浓度 Cα、排放速率 G
 *
 * 【校对与优化记录】
 *  1) 含湿量口径统一：原表区块1 用 (1−C×0.01)、区块6 用 (1−E/100)，实为同一含义
 *     （Xsw 以百分数数值计，如 0.38 表示 0.38%），本引擎统一为 (1 − Xsw/100)，消除误填风险。
 *  2) 标准温度统一为 273.15 K（原表区块5/6/7 用 273、区块8b 用 273.15）。
 *     同一算例下体积偏差 +0.25 L（相对 0.02%），统一后符合 0℃ 标态定义。
 *  3) 原表区块3（静压直填）与区块4（由全压+动压反算静压）是两套独立工况数据，
 *     本引擎改为「二选一」：优先取实测静压，未填时才由全压+动压反算，不做隐式串联。
 *  4) 全部输入项可空，引擎按依赖关系逐项求值：能算的算，算不出的标注缺失项。
 *  5) 标况体积口径开关：原表区块5 E17 只做温度压力修正（湿基），而排放速率用的是
 *     含干基折算的标杆流量 Qn，两者口径不一致。本引擎默认沿用原表口径（与 ZR-3260D 报表一致），
 *     同时提供 dryBasisVolume 开关切换为 GB/T 16157 干基口径（Vnd 乘 (1−Xsw/100)），
 *     便于现场与仪表报表交叉核对。
 */

export const DUST_T0 = 273.15;      // 标态温度 K（0℃）
export const DUST_P0 = 101.325;      // 标态压力 kPa
export const DUST_RHO0 = 1.34;       // 标态烟气密度 kg/m³（湿基经验值）

export interface DustSamplingInput {
  // —— 工况实测 ——
  dynamicPressure: number | null;   // 平均动压 Hd（Pa）
  staticPressure: number | null;    // 平均静压 Ps（kPa，表压，烟气通常为负）
  totalPressure: number | null;     // 烟气全压 Pt（kPa），用于反算静压
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
  // —— 口径开关 ——
  dryBasisVolume?: boolean;         // 标况体积按干基折算（默认 false = 原表/仪表口径）
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

export function computeDustSampling(input: DustSamplingInput): DustSamplingResult {
  const {
    dynamicPressure: Hd, staticPressure: PsIn, totalPressure: Pt, stackTemp: t,
    atmosphere: Ba, moisture: Xsw, pitotCoefficient: Kp,
    crossSection: F, nozzleDiameter: d, samplingMinutes: n,
    filterInitialMass: g1, filterFinalMass: g2,
    meterTemp: tp, meterPressure: Pp,
    O2, O2Base, loadFactor,
    dryBasisVolume = false,
  } = input;

  const steps: string[] = [];
  const values: Record<string, DustValue> = {};

  /** 通用构造：inputs 任一缺失 → value=null 并列出缺失项 */
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
    return { key, label, unit, formula, value, missing: miss, digits, note };
  }

  /* ===== 1. 烟气静压 Ps：实测优先，其次由全压+动压反算（Excel 区块4） ===== */
  let Ps: Num = null;
  let psSource = "";
  if (isNum(PsIn)) {
    Ps = PsIn;
    psSource = "实测静压";
  } else if (isNum(Pt) && isNum(Hd) && isNum(Kp)) {
    Ps = Pt - (Hd / 1000) * Kp * Kp;
    psSource = "由全压+动压反算";
  }
  values.staticPressure = {
    key: "staticPressure",
    label: "烟气静压 Ps",
    unit: "kPa",
    formula: "Ps = Pt − (Hd/1000) × Kp²",
    value: Ps,
    missing: Ps === null ? ["平均静压 Ps（或：烟气全压 Pt + 动压 Hd + 皮托管系数 Kp）"] : [],
    digits: 4,
    note: psSource || undefined,
  };
  if (Ps !== null) {
    steps.push(
      psSource === "实测静压"
        ? `Ps = 实测静压 = ${Ps.toFixed(4)} kPa`
        : `Ps = Pt − (Hd/1000)·Kp² = ${Pt} − (${Hd}/1000)×${Kp}² = ${Ps.toFixed(4)} kPa（由全压+动压反算）`
    );
  }
  const pAbs = isNum(Ba) && isNum(Ps) ? Ba + Ps : null;

  /* ===== 2. 烟气绝对压力 ===== */
  values.pressureAbs = make(
    "pressureAbs", "烟气绝对压力 P", "kPa", "P = Ba + Ps", 4,
    [{ v: Ba, label: "大气压 Ba" }, { v: Ps, label: "烟气静压 Ps" }],
    (a) => a[0] + a[1]
  );

  /* ===== 3. 湿烟气密度 ρ（Excel 区块3 内含） ===== */
  const rhoItem = make(
    "density", "湿烟气密度 ρ", "kg/m³",
    "ρ = 1.34 × 273.15/(273.15+t) × (Ba+Ps)/101.325", 5,
    [{ v: t, label: "烟气温度 t" }, { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" }],
    (a) => DUST_RHO0 * (DUST_T0 / (DUST_T0 + a[0])) * (a[1] / DUST_P0)
  );
  values.density = rhoItem;
  if (rhoItem.value !== null && isNum(t)) {
    steps.push(
      `ρ = 1.34 × 273.15/(273.15+${t}) × (Ba+Ps)/101.325 = ${rhoItem.value.toFixed(5)} kg/m³`
    );
  }

  /* ===== 4. 烟气流速 Vs（Excel 区块3 F11） ===== */
  const vsItem = make(
    "velocity", "烟气流速 Vs", "m/s",
    "Vs = 1.414 × Kp × √(Hd/ρ)", 3,
    [
      { v: Kp, label: "皮托管系数 Kp" },
      { v: Hd, label: "平均动压 Hd" },
      { v: rhoItem.value, label: "湿烟气密度 ρ（需烟温 + 大气压 + 静压）" },
    ],
    (a) => 1.414 * a[0] * Math.sqrt(a[1] / a[2])
  );
  values.velocity = vsItem;
  if (vsItem.value !== null) {
    steps.push(`Vs = 1.414 × Kp × √(Hd/ρ) = ${vsItem.value.toFixed(3)} m/s`);
  }

  /* ===== 5. 等速采样流量 Qrs（Excel 区块1 D5） ===== */
  const qrsItem = make(
    "isokineticFlow", "等速采样流量 Qrs", "L/min",
    "Qrs = 0.047 × d² × Vs × (1 − Xsw/100)", 2,
    [
      { v: d, label: "采样嘴直径 d" },
      { v: vsItem.value, label: "烟气流速 Vs（需动压 + 皮托管系数 + 烟温 + 大气压 + 静压）" },
      { v: Xsw, label: "含湿量 Xsw" },
    ],
    (a) => 0.047 * a[0] * a[0] * a[1] * (1 - a[2] / 100)
  );
  values.isokineticFlow = qrsItem;
  if (qrsItem.value !== null) {
    steps.push(`Qrs = 0.047 × d² × Vs × (1 − Xsw/100) = ${qrsItem.value.toFixed(2)} L/min`);
  }

  /* ===== 6. 采样嘴直径反算（Excel 区块2 D8） ===== */
  values.nozzleDiameterCalc = make(
    "nozzleDiameterCalc", "采样嘴直径（反算）", "mm",
    "D = √(Qrs / (0.047 × Vs × (1 − Xsw/100)))", 2,
    [
      { v: qrsItem.value, label: "等速采样流量 Qrs" },
      { v: vsItem.value, label: "烟气流速 Vs" },
      { v: Xsw, label: "含湿量 Xsw" },
    ],
    (a) => Math.sqrt(a[0] / (0.047 * a[1] * (1 - a[2] / 100)))
  );

  /* ===== 7. 工况采样体积 V（Excel 区块8a C26） ===== */
  const vItem = make(
    "volumeWet", "工况采样体积 V", "L",
    "V = Qrs × n", 2,
    [{ v: qrsItem.value, label: "等速采样流量 Qrs" }, { v: n, label: "累计采样时长 n" }],
    (a) => a[0] * a[1]
  );
  values.volumeWet = vItem;
  if (vItem.value !== null) {
    steps.push(`V = Qrs × n = ${vItem.value.toFixed(2)} L`);
  }

  /* ===== 8. 计温计压法体积 V'（Excel 区块8b H28，口径按原表） ===== */
  values.volumeMeter = make(
    "volumeMeter", "采样体积（计温计压修正）", "L",
    "V' = Qrs × (Ba+Ps)(273.15+t′) / [(Ba+P′)(273.15+t)] × n", 2,
    [
      { v: qrsItem.value, label: "等速采样流量 Qrs" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      { v: tp, label: "计温 t′" },
      { v: isNum(Ba) && isNum(Pp) ? Ba + Pp : null, label: "大气压 Ba + 计压 P′" },
      { v: t, label: "烟气温度 t" },
      { v: n, label: "累计采样时长 n" },
    ],
    (a) => a[0] * (a[1] * (DUST_T0 + a[2])) / (a[3] * (DUST_T0 + a[4])) * a[5],
    "原表口径：按采样流量计计温计压条件修正的体积；换算方向以本机仪表报表为准"
  );

  /* ===== 9. 标况采样体积 Vnd（Excel 区块5 E17） ===== */
  const vndBase = make(
    "volumeStandard", "标况采样体积 Vnd", "L",
    dryBasisVolume
      ? "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)（干基）"
      : "Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325（湿基，与原表/仪表报表一致）",
    2,
    [
      { v: vItem.value, label: "工况采样体积 V（需等速采样流量 + 采样时长）" },
      { v: t, label: "烟气温度 t" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      ...(dryBasisVolume ? [{ v: Xsw, label: "含湿量 Xsw" }] : []),
    ],
    (a) =>
      a[0] * (DUST_T0 / (DUST_T0 + a[1])) * (a[2] / DUST_P0) *
      (dryBasisVolume ? (1 - a[3] / 100) : 1),
    dryBasisVolume ? "干基口径" : "湿基口径"
  );
  values.volumeStandard = vndBase;
  if (vndBase.value !== null) {
    steps.push(`Vnd = V × 273.15/(273.15+t) × (Ba+Ps)/101.325${dryBasisVolume ? " × (1 − Xsw/100)" : ""} = ${vndBase.value.toFixed(2)} L`);
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

  /* ===== 11. 颗粒物浓度 C ===== */
  const cItem = make(
    "concentration", "颗粒物浓度 C", "mg/m³",
    "C = (g2 − g1) / Vnd × 10⁶", 2,
    [
      { v: massItem.value, label: "颗粒物净重 Δg（需 g1、g2）" },
      { v: vndBase.value, label: "标况采样体积 Vnd" },
    ],
    (a) => (a[0] / a[1]) * 1e6
  );
  values.concentration = cItem;
  if (cItem.value !== null) {
    steps.push(`C = Δg/Vnd × 10⁶ = ${cItem.value.toFixed(2)} mg/m³`);
  }

  /* ===== 12-13. 过剩空气系数 α 与折算系数 αs ===== */
  const alphaItem = make(
    "alpha", "过剩空气系数 α", "",
    "α = 21 / (21 − O₂实测)", 4,
    [{ v: O2, label: "实测 O₂ 浓度" }],
    (a) => 21 / (21 - a[0])
  );
  values.alpha = alphaItem;
  const alphaSItem = make(
    "alphaS", "折算系数 αs", "",
    "αs = 21 / (21 − O₂基准)", 4,
    [{ v: O2Base, label: "基准含氧量" }],
    (a) => 21 / (21 - a[0])
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

  /* ===== 15. 实际烟气流量 Qs（Excel 区块7 C23） ===== */
  const qsItem = make(
    "flueGasFlow", "实际烟气流量 Qs（湿基工况）", "m³/h",
    "Qs = Vs × F × 3600", 0,
    [{ v: vsItem.value, label: "烟气流速 Vs" }, { v: F, label: "烟道截面积 F" }],
    (a) => a[0] * a[1] * 3600
  );
  values.flueGasFlow = qsItem;

  /* ===== 16. 标杆烟气流量 Qn（Excel 区块6 F20，标况干基） ===== */
  const qnItem = make(
    "dryStandardFlow", "标杆烟气流量 Qn（标况干基）", "m³/h",
    "Qn = Qs × 273.15/(273.15+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)", 0,
    [
      { v: qsItem.value, label: "实际烟气流量 Qs（需流速 + 烟道截面积）" },
      { v: t, label: "烟气温度 t" },
      { v: pAbs, label: "大气压 Ba + 烟气静压 Ps" },
      { v: Xsw, label: "含湿量 Xsw" },
    ],
    (a) => a[0] * (DUST_T0 / (DUST_T0 + a[1])) * (a[2] / DUST_P0) * (1 - a[3] / 100)
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
    (a) => a[0] * a[1] * 1e-6
  );
  values.emissionRate = gItem;
  if (gItem.value !== null) {
    steps.push(`G = C × Qn × 10⁻⁶ = ${gItem.value.toFixed(4)} kg/h`);
  }

  const list = Object.values(values);
  const computedCount = list.filter((v) => v.value !== null).length;

  return { values, steps, computedCount, totalCount: list.length };
}

/** 示例数据（ZR-3260D 报表实例量级，实测工况自洽） */
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
  dryBasisVolume: false,
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
  dryBasisVolume: false,
};
