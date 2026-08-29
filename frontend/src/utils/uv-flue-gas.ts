/**
 * uv-flue-gas.ts — 紫外烟气模型计算引擎（v2 重写）
 *
 * 依据 HJ 75-2017 / HJ 1045-2019 附录 A 折算公式链（用户截图 A1~A9）：
 *  (A1) 工况浓度 ↔ 标况浓度：Csn = Cs × 101325/(Ba+Ps) × (273+ts)/273
 *       （工况/标况的干湿基状态相同；Ba 环境大气压 Pa、Ps 烟气静压 Pa、ts 烟温 ℃）
 *  (A2) 干基 ↔ 湿基：C干 = C湿 / (1 − Xsw/100)
 *  (A3) 体积浓度 ↔ 标态干质量浓度：CQ = M/22.4 × Cv
 *       （M 摩尔质量 g/mol；Cv 体积浓度 μmol/mol；22.4 标态摩尔体积 L/mol）
 *  (A4) NOx 质量浓度（以 NO2 计）：CNOx = CNO × M(NO2)/M(NO) + CNO2
 *  (A5) NOx 体积浓度（以 NO2 计）：CNOx = (CNOv + CNO2v) × M(NO2)/22.4
 *  (A7) 折算浓度（基准过量空气系数 αs）：C折 = Csn干 × α/αs
 *  (A8) 实测过剩空气系数：α = 21 / (21 − O2干)
 *  (A9) 折算浓度（基准含氧量 O2s）：C折 = Csn干 × (21 − O2s)/(21 − O2干)
 *
 * 单位约定：
 *  - 体积浓度 μmol/mol（=ppm）；质量浓度 mg/m³（标态干基）
 *  - M：SO2=64.06、NO=30.006、NO2=46.005
 *  - 压力单位 Pa（Ba+Ps 绝对压），与 A1 的 101325 对应
 */

// 摩尔质量 g/mol
export const MOL = {
  SO2: 64.06,
  NO: 30.006,
  NO2: 46.005,
} as const;

export type GasKey = "SO2" | "NO" | "NO2";

/** A3：体积浓度 μmol/mol → 标态质量浓度 mg/m³（CQ = M/22.4 × Cv） */
export function volumeToMass(cv: number, M: number): number {
  return (M / 22.4) * cv;
}

/** A3 逆：标态质量浓度 → 体积浓度 */
export function massToVolume(cq: number, M: number): number {
  return (cq * 22.4) / M;
}

/** A1：工况 → 标况（干湿基状态相同）。压力单位 Pa */
export function workingToStandard(
  cs: number, ba: number, ps: number, ts: number
): { csn: number; factor: number; steps: string[] } {
  const factor = (101325 / (ba + ps)) * ((273 + ts) / 273);
  const csn = cs * factor;
  return {
    csn,
    factor,
    steps: [
      `折标系数 = 101325/(Ba+Ps) × (273+ts)/273 = 101325/${ba + ps} × ${(273 + ts)}/273 = ${factor.toFixed(5)}`,
      `Csn = Cs × ${factor.toFixed(5)} = ${cs.toFixed(2)} → ${csn.toFixed(2)}`,
    ],
  };
}

/** A1 逆：标况 → 工况 */
export function standardToWorking(csn: number, ba: number, ps: number, ts: number): number {
  return csn / ((101325 / (ba + ps)) * ((273 + ts) / 273));
}

/** A2：湿基 → 干基（C干 = C湿/(1−Xsw/100)，单位不限，干湿状态相同） */
export function wetToDryBase(cWet: number, Xsw: number): { cDry: number; steps: string[] } {
  const cDry = cWet / (1 - Xsw / 100);
  return { cDry, steps: [`C干 = C湿/(1−Xsw/100) = ${cWet}/(1−${Xsw}/100) = ${cDry.toFixed(3)}`] };
}

/** A2 逆：干基 → 湿基 */
export function dryToWetBase(cDry: number, Xsw: number): number {
  return cDry * (1 - Xsw / 100);
}

/** A4：NOx 质量浓度（以 NO2 计）= CNO×M(NO2)/M(NO) + CNO2（同状态 mg/m³） */
export function noxMass(cno: number, cno2: number): { nox: number; steps: string[] } {
  const nox = (cno * MOL.NO2) / MOL.NO + cno2;
  return {
    nox,
    steps: [`CNOx = CNO×M(NO2)/M(NO) + CNO2 = ${cno}×${MOL.NO2}/${MOL.NO} + ${cno2} = ${nox.toFixed(2)} mg/m³`],
  };
}

/** A5：NOx 体积浓度（以 NO2 计）= (CNOv+CNO2v) × M(NO2)/22.4 → 标态质量 mg/m³ */
export function noxVolume(cnov: number, cno2v: number): { noxPpm: number; noxMass: number; steps: string[] } {
  const noxPpm = cnov + cno2v;
  const mass = ((cnov + cno2v) * MOL.NO2) / 22.4;
  return {
    noxPpm,
    noxMass: mass,
    steps: [
      `CNOx体积 = CNOv + CNO2v = ${cnov} + ${cno2v} = ${noxPpm} μmol/mol`,
      `CNOx质量 = (CNOv+CNO2v) × M(NO2)/22.4 = ${noxPpm} × ${MOL.NO2}/22.4 = ${mass.toFixed(2)} mg/m³`,
    ],
  };
}

/** A8：实测过剩空气系数 α = 21/(21 − O2干) */
export function excessAir(O2dry: number): { alpha: number; steps: string[] } {
  const alpha = 21 / (21 - O2dry);
  return { alpha, steps: [`α = 21/(21 − O2干) = 21/(21 − ${O2dry}) = ${alpha.toFixed(4)}`] };
}

/** A7：折算浓度（αs 基准过量空气系数）C折 = Csn干 × α/αs */
export function adjustByAlpha(csnDry: number, alpha: number, alphaS: number): { adjusted: number; steps: string[] } {
  const adjusted = csnDry * (alpha / alphaS);
  return { adjusted, steps: [`C折 = Csn干 × α/αs = ${csnDry} × ${alpha.toFixed(4)}/${alphaS.toFixed(4)} = ${adjusted.toFixed(2)} mg/m³`] };
}

/** A9：折算浓度（基准含氧量 O2s）C折 = Csn干 × (21−O2s)/(21−O2干) */
export function adjustByO2(csnDry: number, O2dry: number, O2s: number): { adjusted: number; steps: string[] } {
  const adjusted = csnDry * ((21 - O2s) / (21 - O2dry));
  return {
    adjusted,
    steps: [`C折 = Csn干 × (21−O2s)/(21−O2干) = ${csnDry} × (21−${O2s})/(21−${O2dry}) = ${adjusted.toFixed(2)} mg/m³`],
  };
}

/** 常用行业基准值（GB 13223 燃煤锅炉等） */
export const O2S_PRESETS = [
  { label: "燃煤锅炉", o2s: 6 },
  { label: "燃气锅炉", o2s: 3.5 },
  { label: "燃油锅炉", o2s: 3 },
  { label: "垃圾焚烧", o2s: 11 },
  { label: "钢铁烧结", o2s: 16 },
];

export const UV_DEMO = {
  // 仪器直读：标态干基 μmol/mol（多数紫外烟气分析仪直读形式）
  so2_ppm: 86,
  no_ppm: 92,
  no2_ppm: 6,
  // 现场参数
  ba: 101300,   // 环境大气压 Pa
  ps: -800,     // 烟气静压 Pa（负压烟道）
  ts: 93.4,     // 烟温 ℃
  Xsw: 7.8,     // 含湿量 %
  O2dry: 13.5,  // 氧量干基 %
  o2s: 6,       // 基准含氧量（燃煤锅炉）
};
