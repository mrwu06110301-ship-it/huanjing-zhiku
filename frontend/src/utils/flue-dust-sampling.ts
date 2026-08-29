/**
 * flue-dust-sampling.ts — 烟尘采样模型计算引擎
 *
 * 依据 ZR-3260D 型烟尘采样仪器报表逻辑（烟尘采样数据准确性验证 V1.45）
 * 参照 GB/T 16157 固定污染源颗粒物测定方法
 *
 * 公式链：
 *  1. 湿烟气密度 ρ = 1.34 × 273/(273+t) × (Ba+Ps)/101.325      [kg/m³(标态湿烟气)]
 *  2. 烟气流速 Vs = 1.414 × Kp × √(Hd/ρ)                        [m/s]
 *  3. 等速采样流量 Qrs = 0.047 × d² × Vs × (1 − Xsw/100)         [L/min]
 *  4. 工况采样体积 V = Qrs × n（n 为分钟）                        [L]
 *  5. 标况采样体积 Vnd = V × 273/(273+t) × (Ba+Ps)/101.325       [L]
 *     （注：仪器报表用 101.35 近似，本引擎取 101.325 精确值）
 *  6. 颗粒物净重 G = g2 − g1                                     [g]
 *  7. 颗粒物浓度 C = G / Vnd × 10⁶                               [mg/m³]
 *  8. 过剩空气系数 α = 21 / (21 − O2实测)
 *  9. 折算系数 αs = 21 / (21 − O2基准)
 * 10. 折算浓度 Cα = C × α / αs × 出力系数
 * 11. 烟气流量 Qs = Vs × F × 3600                                [m³/h]
 * 12. 标干流量 Qsnd = Qs × 273/(273+t) × (Ba+Ps)/101.325 × (1 − Xsw/100)  [m³/h]
 * 13. 排放速率 G排 = C × Qsnd × 10⁻⁶                             [kg/h]
 */

export interface DustSamplingInput {
  // —— 现场实测 ——
  dynamicPressure: number;   // 平均动压 Hd（Pa）
  staticPressure: number;    // 平均静压 Ps（kPa，表压，一般烟气为负）
  stackTemp: number;         // 平均烟温 t（℃）
  atmosphere: number;        // 大气压 Ba（kPa）
  moisture: number;          // 含湿量 Xsw（%）
  pitotCoefficient: number;  // 皮托管系数 Kp（S 型 0.84）
  nozzleDiameter: number;    // 采样嘴直径 d（mm）
  crossSection: number;      // 烟道截面 F（m²）
  // —— 采样称量 ——
  samplingMinutes: number;   // 累计采样时长 n（min）
  filterInitialMass: number; // 滤筒初始重量 g1（g）
  filterFinalMass: number;   // 滤筒最终重量 g2（g）
  // —— 折算参数 ——
  O2: number;                // 实测 O2 浓度（%）
  O2Base: number;            // 基准含氧量（%，燃煤锅炉 9）
  loadFactor: number;        // 负荷系数（出力系数，一般取 1）
}

export interface DustSamplingResult {
  density: number;        // 湿烟气密度 ρ
  velocity: number;       // 烟气流速 Vs
  isokineticFlow: number; // 等速采样流量 Qrs
  volumeWet: number;      // 工况采样体积 V
  volumeStandard: number; // 标况采样体积 Vnd
  dustMass: number;       // 颗粒物净重
  concentration: number;  // 颗粒物浓度 C（mg/m³，实测）
  alpha: number;          // 过剩空气系数 α
  alphaS: number;         // 折算系数 αs
  concentrationAdjusted: number; // 折算浓度 Cα（mg/m³）
  flueGasFlow: number;    // 烟气流量 Qs（m³/h，湿基工况）
  dryStandardFlow: number; // 标干流量 Qsnd（m³/h）
  emissionRate: number;   // 排放速率（kg/h）
  steps: string[];        // 计算过程
}

export function computeDustSampling(input: DustSamplingInput): DustSamplingResult {
  const {
    dynamicPressure: Hd, staticPressure: Ps, stackTemp: t,
    atmosphere: Ba, moisture: Xsw, pitotCoefficient: Kp,
    nozzleDiameter: d, crossSection: F,
    samplingMinutes: n, filterInitialMass: g1, filterFinalMass: g2,
    O2, O2Base, loadFactor,
  } = input;
  const steps: string[] = [];
  const P_ABS = Ba + Ps; // 烟气绝对压力 kPa
  steps.push(`烟气绝对压力 = Ba + Ps = ${Ba} + (${Ps}) = ${P_ABS.toFixed(3)} kPa`);

  // 1. 湿烟气密度（标态 1.34 kg/m³ 折算到工况）
  const rho = 1.34 * (273 / (273 + t)) * (P_ABS / 101.325);
  steps.push(
    `ρ = 1.34 × 273/(273+t) × (Ba+Ps)/101.325 = 1.34 × ${(273 / (273 + t)).toFixed(5)} × ${(P_ABS / 101.325).toFixed(5)} = ${rho.toFixed(4)} kg/m³`
  );

  // 2. 烟气流速
  const Vs = 1.414 * Kp * Math.sqrt(Hd / rho);
  steps.push(
    `Vs = 1.414 × Kp × √(Hd/ρ) = 1.414 × ${Kp} × √(${Hd}/${rho.toFixed(4)}) = ${Vs.toFixed(3)} m/s`
  );

  // 3. 等速采样流量
  const Qrs = 0.047 * d * d * Vs * (1 - Xsw / 100);
  steps.push(
    `Qrs = 0.047 × d² × Vs × (1 − Xsw/100) = 0.047 × ${d}² × ${Vs.toFixed(3)} × ${(1 - Xsw / 100).toFixed(4)} = ${Qrs.toFixed(2)} L/min`
  );

  // 4. 工况采样体积
  const V = Qrs * n;
  steps.push(`V = Qrs × n = ${Qrs.toFixed(2)} × ${n} = ${V.toFixed(2)} L`);

  // 5. 标况采样体积
  const Vnd = V * (273 / (273 + t)) * (P_ABS / 101.325);
  steps.push(
    `Vnd = V × 273/(273+t) × (Ba+Ps)/101.325 = ${V.toFixed(2)} × ${(273 / (273 + t)).toFixed(5)} × ${(P_ABS / 101.325).toFixed(5)} = ${Vnd.toFixed(2)} L`
  );

  // 6. 颗粒物净重
  const dustMass = g2 - g1;
  steps.push(`颗粒物净重 = g2 − g1 = ${g2} − ${g1} = ${dustMass.toFixed(4)} g`);

  // 7. 颗粒物浓度
  const C = (dustMass / Vnd) * 1e6;
  steps.push(`C = 净重/Vnd × 10⁶ = ${dustMass.toFixed(4)}/${Vnd.toFixed(2)} × 10⁶ = ${C.toFixed(1)} mg/m³`);

  // 8-9. 过剩空气系数与折算系数
  const alpha = 21 / (21 - O2);
  const alphaS = 21 / (21 - O2Base);
  steps.push(`α = 21/(21 − O2实测) = 21/(21 − ${O2}) = ${alpha.toFixed(4)}`);
  steps.push(`αs = 21/(21 − O2基准) = 21/(21 − ${O2Base}) = ${alphaS.toFixed(4)}`);

  // 10. 折算浓度
  const Cadj = C * (alpha / alphaS) * loadFactor;
  steps.push(
    `C折算 = C × α/αs × 负荷系数 = ${C.toFixed(1)} × ${(alpha / alphaS).toFixed(4)} × ${loadFactor} = ${Cadj.toFixed(1)} mg/m³`
  );

  // 11. 烟气流量（湿基工况）
  const Qs = Vs * F * 3600;
  steps.push(`Qs = Vs × F × 3600 = ${Vs.toFixed(3)} × ${F} × 3600 = ${Qs.toFixed(0)} m³/h`);

  // 12. 标干流量
  const Qsnd = Qs * (273 / (273 + t)) * (P_ABS / 101.325) * (1 - Xsw / 100);
  steps.push(
    `Qsnd = Qs × 273/(273+t) × (Ba+Ps)/101.325 × (1 − Xsw/100) = ${Qs.toFixed(0)} × ${(273 / (273 + t)).toFixed(5)} × ${(P_ABS / 101.325).toFixed(5)} × ${(1 - Xsw / 100).toFixed(4)} = ${Qsnd.toFixed(0)} m³/h`
  );

  // 13. 排放速率
  const G = C * Qsnd * 1e-6;
  steps.push(`排放速率 = C × Qsnd × 10⁻⁶ = ${C.toFixed(1)} × ${Qsnd.toFixed(0)} × 10⁻⁶ = ${G.toFixed(3)} kg/h`);

  return {
    density: rho, velocity: Vs, isokineticFlow: Qrs,
    volumeWet: V, volumeStandard: Vnd, dustMass,
    concentration: C, alpha, alphaS,
    concentrationAdjusted: Cadj,
    flueGasFlow: Qs, dryStandardFlow: Qsnd, emissionRate: G,
    steps,
  };
}

/** 示例数据（ZR-3260D 报表实例） */
export const DUST_DEMO: DustSamplingInput = {
  dynamicPressure: 65,
  staticPressure: -0.04,
  stackTemp: 93.4,
  atmosphere: 101.9,
  moisture: 7.89,
  pitotCoefficient: 0.84,
  nozzleDiameter: 8,
  crossSection: 9.6211,
  samplingMinutes: 45,
  filterInitialMass: 10.13587,
  filterFinalMass: 25.25694,
  O2: 14.2,
  O2Base: 9,
  loadFactor: 1,
};
