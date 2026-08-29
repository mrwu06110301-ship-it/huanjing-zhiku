/**
 * uv-flue-gas.ts — 紫外烟气模型计算引擎
 *
 * 依据：
 *  - HJ 1045-2019《固定污染源烟气（二氧化硫和氮氧化物）便携式紫外吸收法测量仪器技术要求及检测方法》
 *  - HJ 1131-2020《固定污染源废气 二氧化硫的测定 便携式紫外吸收法》
 *  - HJ 1132-2020《固定污染源废气 氮氧化物的测定 便携式紫外吸收法》
 *
 * 紫外差分吸收光谱法（DOAS）：朗伯-比尔定律 + 差分算法
 *  I(λ) = I0(λ) · exp[−Σ (σi(λ)·ci·L)]
 *  差分吸收：σ = σb(宽带) + σ'(窄带差分截面)，对光谱做高通滤波分离慢变化（粉尘/水汽/光源漂移）与快变化（气体窄带吸收），
 *  用差分截面 σ' 经最小二乘反演浓度 c。
 *
 * 本工具提供：
 *  1) 朗伯-比尔定律浓度反演（已知 σ'、L、差分吸光度 A'）
 *  2) NOx 换算（NO + NO2、NO→NO2 质量换算 46/30）
 *  3) 千基/湿基转换、标况换算
 *  4) 折算浓度（过剩空气系数法）与排放速率
 *  5) 检出限/示值误差判定（HJ 1045/1131/1132 指标）
 */

export interface BeerLambertInput {
  absorbance: number;     // 差分吸光度 A' = ln(I0'/I')（无量纲）
  crossSection: number;   // 差分吸收截面 σ'（cm²/mol 分子）
  pathLength: number;     // 光程 L（cm 或 m，与截面单位配套，见 unitFlag）
  pathUnit?: "cm" | "m";
}

/** 朗伯-比尔：c(ppm) = A' / (σ'·L) ，σ' 单位 cm²/molecule、L 单位 cm 时结果为 molecule/cm³，再换 ppm */
export function beerLambert(input: BeerLambertInput): { ppm: number; moleculesPerCm3: number; steps: string[] } {
  const L_cm = input.pathUnit === "m" ? input.pathLength * 100 : input.pathLength;
  const N = input.absorbance / (input.crossSection * L_cm); // molecule/cm³
  // 1 ppm = 2.463e13 molecule/cm³（25℃、101.325kPa，Loschmidt 2.463e19 / 1e6）
  const ppm = N / 2.463e13;
  const steps = [
    `A' = ln(I0'/I') = ${input.absorbance}`,
    `分子数浓度 N = A'/(σ'·L) = ${input.absorbance}/(${input.crossSection.toExponential(2)} × ${L_cm}) = ${N.toExponential(3)} molecule/cm³`,
    `c(ppm) = N / 2.463×10¹³ = ${ppm.toFixed(3)} ppm（25℃、101.325 kPa）`,
  ];
  return { ppm, moleculesPerCm3: N, steps };
}

// ==================== NOx 换算 ====================

/** NOx 相关换算：NO/NO2 质量比 46/30（M_NO=30.006, M_NO2=46.006） */
export const M_NO = 30.006;
export const M_NO2 = 46.006;

export function noxSum(no_ppm: number, no2_ppm: number): { noxPpm: number; steps: string[] } {
  // 以 NO2 计：NO 折算为等效 NO2
  const nox = no_ppm + no2_ppm;
  const steps = [
    `NOx(以 NO2 计) = NO + NO2 = ${no_ppm} + ${no2_ppm} = ${nox} μmol/mol(ppm)`,
  ];
  return { noxPpm: nox, steps };
}

/** ppm → mg/m³（25℃ 参比 24.45 / 0℃ 标况 22.414） */
export function ppmToMgm3(ppm: number, molarMass: number, temp: "25C" | "0C" = "25C"): number {
  const Vm = temp === "25C" ? 24.45 : 22.414;
  return (ppm * molarMass) / Vm;
}

// ==================== 干湿基 / 标况换算 ====================

/** 湿基浓度 → 干基浓度：c干 = c湿/(1 − Xsw/100) */
export function wetToDry(cWet: number, Xsw: number): { cDry: number; steps: string[] } {
  const cDry = cWet / (1 - Xsw / 100);
  return {
    cDry,
    steps: [`c干 = c湿/(1 − Xsw/100) = ${cWet}/(1 − ${Xsw}/100) = ${cDry.toFixed(2)} mg/m³`],
  };
}

/** 干基浓度 → 湿基浓度：c湿 = c干 × (1 − Xsw/100) */
export function dryToWet(cDry: number, Xsw: number): number {
  return cDry * (1 - Xsw / 100);
}

// ==================== 折算与排放速率 ====================

export interface AdjustInput {
  concentration: number; // 实测干基浓度 mg/m³
  O2: number;            // 实测氧量 %
  O2Base: number;        // 基准含氧量 %
  loadFactor?: number;    // 负荷系数（一般 1）
}

export function adjustConcentration(input: AdjustInput): { alpha: number; alphaS: number; adjusted: number; steps: string[] } {
  const { concentration: c, O2, O2Base, loadFactor = 1 } = input;
  const alpha = 21 / (21 - O2);
  const alphaS = 21 / (21 - O2Base);
  const adjusted = c * (alpha / alphaS) * loadFactor;
  const steps = [
    `α = 21/(21 − O2实测) = 21/(21 − ${O2}) = ${alpha.toFixed(4)}`,
    `αs = 21/(21 − O2基准) = 21/(21 − ${O2Base}) = ${alphaS.toFixed(4)}`,
    `折算浓度 = ${c} × ${alpha.toFixed(4)}/${alphaS.toFixed(4)} × ${loadFactor} = ${adjusted.toFixed(2)} mg/m³`,
  ];
  return { alpha, alphaS, adjusted, steps };
}

/** 排放速率：G = c × Qsnd × 10⁻⁶（c：mg/m³ 干基；Qsnd：标干流量 m³/h） */
export function emissionRate(cDry: number, Qsnd: number): { rate: number; steps: string[] } {
  const rate = cDry * Qsnd * 1e-6;
  return { rate, steps: [`排放速率 G = c干 × Qsnd × 10⁻⁶ = ${cDry} × ${Qsnd} × 10⁻⁶ = ${rate.toFixed(3)} kg/h`] };
}

// ==================== HJ 指标判定 ====================

export interface HJIndicator {
  name: string;      // 指标名
  value: number;     // 实测值
  limit: number;     // 限值
  unit: string;
  betterWhenLower: boolean; // 越小越好
  note?: string;
}

export function judgeIndicator(ind: HJIndicator): { pass: boolean; text: string } {
  const pass = ind.betterWhenLower ? ind.value <= ind.limit : Math.abs(ind.value) <= ind.limit;
  const arrow = pass ? "≤" : ">";
  return {
    pass,
    text: `${ind.name}: ${ind.value}${ind.unit} ${arrow} ${ind.limit}${ind.unit} ${pass ? "✓ 合格" : "✗ 不合格"}${ind.note ? "（" + ind.note + "）" : ""}`,
  };
}

/** HJ 1045-2019 / HJ 1131 / HJ 1132 关键性能指标限值 */
export const HJ_LIMITS = {
  /** 示值误差 ≤ ±2% FS（HJ 1045）；HJ 1131/1132 ≤±3% 或 ≤3.0 μmol/mol（量程≤100） */
  indicationErrorFS: 2,
  indicationErrorHJ: 3,
  /** 重复性：相对标准偏差 RSD ≤ 2%（HJ 1045） */
  rsd: 2,
  /** 1h 零点漂移 / 量程漂移 ≤ ±2% FS */
  drift1h: 2,
  /** 检出限（mg/m³）：SO2=2（HJ 1131），NO=1、NO2=2（HJ 1132） */
  lod: { SO2: 2, NO: 1, NO2: 2 },
  /** 环境温度影响 ≤ ±5% FS（0~40℃） */
  tempEffect: 5,
  /** 平行性：三台仪器 RSD ≤ 5% */
  parallelism: 5,
  /** NO2→NO 转化器效率 ≥ 95%（HJ 1045 附录） */
  converterEff: 95,
} as const;

/** 重复性 RSD(%) = s/x̄×100，输入多次测量值 */
export function calcRSD(values: number[]): { rsd: number; mean: number; steps: string[] } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const rsd = (s / mean) * 100;
  return {
    rsd, mean,
    steps: [`x̄ = ${mean.toFixed(3)}，s = ${s.toFixed(4)}（n=${n}）`, `RSD = s/x̄×100 = ${rsd.toFixed(2)}%`],
  };
}

// ==================== 演示数据 ====================
export const UV_DEMO = {
  absorbance: 0.082,
  crossSection: 2.6e-19, // SO2 差分截面示例 cm²/molecule（200-230nm 波段量级）
  pathLength: 0.3,
  pathUnit: "m" as const,
  no_ppm: 86,
  no2_ppm: 6,
  Xsw: 7.8,
  O2: 13.5,
  O2Base: 9,
  Qsnd: 228000,
};
