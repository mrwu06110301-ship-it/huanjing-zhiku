/**
 * rc-moisture.ts — 阻容含湿量模型计算引擎
 *
 * 阻容法测湿：电阻测温度、电容测相对湿度（高分子薄膜电容随环境水汽变化），
 * 传感器输出 T（温度）+ RH（相对湿度），含湿量（体积分数）需经水蒸气分压换算。
 *
 * P当前 = 传感器处实际绝对压力 = 大气压 Ba + 计前压力 Pg（计前负压为负值）
 *
 * 饱和水蒸气压「查表」逻辑：预置 0~100℃ 整数点表（Buck 公式生成，±0.06%），
 * 非整数温度在相邻整数点之间线性插值——如 25.3℃ = P(25) + 0.3×(P(26)−P(25))。
 *
 * 两种水蒸气分压计算路径：
 *  方式1（饱和蒸汽压法）：
 *   (1) P饱和 = f(T) —— 查表线性插值
 *   (2) P分压 = P饱和 × RH(%)/100
 *   (3) 含湿量 Xsw(体积比%) = P分压 / P当前 × 100
 *
 *  方式2（露点法）：
 *   (1) 由 T、RH 计算露点 Td（Magnus-Tetens）
 *   (2) P分压 = 查表(Td)（露点线性插值到整数点之间）
 *   (3) 含湿量 Xsw = P分压 / P当前 × 100
 */

/** Buck 公式：饱和水蒸气压 kPa（用于生成查表整数点基准，0~100℃ 精度 ±0.06%） */
export function saturationVaporPressure(tC: number): number {
  return 0.61121 * Math.exp(((18.678 - tC / 234.5) * tC) / (257.14 + tC));
}

/** 整数温度点饱和水蒸气压表（0~100℃，kPa，Buck 公式生成） */
export const SAT_TABLE: number[] = Array.from({ length: 101 }, (_, t) =>
  Number(saturationVaporPressure(t).toFixed(4))
);

/**
 * 查表线性插值：整数温度直接取表值；小数温度在相邻整数点间线性取值。
 * 如 25.3℃ → P(25) + 0.3 × (P(26) − P(25))
 */
export function satLookup(tC: number): { p: number; tLow: number; tHigh: number; frac: number; pLow: number; pHigh: number } {
  const t = Math.min(100, Math.max(0, tC));
  const tLow = Math.floor(t);
  const tHigh = Math.min(100, tLow + 1);
  const frac = t - tLow;
  const pLow = SAT_TABLE[tLow];
  const pHigh = SAT_TABLE[tHigh];
  const p = pLow + frac * (pHigh - pLow);
  return { p, tLow, tHigh, frac, pLow, pHigh };
}

/** Magnus-Tetens 露点计算（℃，RH 以 % 输入） */
export function dewPoint(tC: number, rh: number): number {
  const a = 17.625, b = 243.04;
  const alpha = Math.log(rh / 100) + (a * tC) / (b + tC);
  return (b * alpha) / (a - alpha);
}

export interface MoistureInput {
  temperature: number; // 阻容传感器温度 T（℃）
  humidity: number;    // 相对湿度 RH（%）
  atmospheric: number; // 大气压 Ba（kPa）
  gauge: number;       // 计前压力 Pg（表压 kPa，负压工况为负值，常压扩散测量填 0）
  method?: 1 | 2;      // 计算方式：1 饱和蒸汽压法；2 露点法
}

export interface MoistureResult {
  pressure: number;    // P当前 = Ba + Pg（传感器处绝对压力 kPa）
  pSat: number;        // T 查表饱和水蒸气压 kPa（线性插值）
  pDew: number;        // 露点查表饱和水蒸气压 kPa（= 实际水蒸气分压，方式2）
  dewPoint: number;    // 露点 ℃
  pPartial: number;    // 水蒸气分压 kPa
  moisture: number;    // 含湿量 Xsw（体积比 %）
  steps: string[];
}

export function computeMoisture(input: MoistureInput): MoistureResult {
  const { temperature: T, humidity: RH, atmospheric: Ba, gauge: Pg, method = 1 } = input;
  const P = Ba + Pg; // 传感器处实际压力
  const steps: string[] = [];

  steps.push(
    `① P当前 = 大气压 + 计前压力 = ${Ba} + ${Pg} = ${P.toFixed(2)} kPa（传感器处实际绝对压力）`
  );

  // 查表线性插值（方式1 用）
  const sat = satLookup(T);
  steps.push(
    `② 查表 P饱和(${T}℃)：P(${sat.tLow}) = ${sat.pLow} kPa，P(${sat.tHigh}) = ${sat.pHigh} kPa，线性插值 ${sat.frac} → ${sat.p.toFixed(4)} kPa`
  );

  // 露点及其查表值（方式2 用 / 交叉验证）
  const Td = dewPoint(T, RH);
  const dewSat = satLookup(Td);
  const pDew = dewSat.p;
  steps.push(
    `③ 露点 Td = 243.04×ln(RH/100×exp(17.625T/(T+243.04))) / (17.625 − …) = ${Td.toFixed(2)} ℃（查表插值 → ${pDew.toFixed(4)} kPa）`
  );

  let pPartial: number;
  if (method === 1) {
    pPartial = sat.p * (RH / 100);
    steps.push(
      `④ 方式1：P分压 = P饱和 × RH/100 = ${sat.p.toFixed(4)} × ${RH}% = ${pPartial.toFixed(4)} kPa`
    );
  } else {
    pPartial = pDew;
    steps.push(
      `④ 方式2：P分压 = 查表(Td=${Td.toFixed(2)}℃) = ${pDew.toFixed(4)} kPa（露点对应的饱和蒸汽压即实际水蒸气分压）`
    );
  }

  const Xsw = (pPartial / P) * 100;
  steps.push(
    `⑤ 含湿量 Xsw = P分压/P当前 × 100 = ${pPartial.toFixed(4)}/${P.toFixed(2)} × 100 = ${Xsw.toFixed(3)} %`
  );
  steps.push(
    `⑥ 露点 ${Td.toFixed(2)}℃ 交叉验证：查表(Td)/P = ${((pDew / P) * 100).toFixed(3)} %${Math.abs(pDew / P * 100 - Xsw) < 0.05 ? "（与所选方式一致）" : ""}`
  );

  return { pressure: P, pSat: sat.p, pDew, dewPoint: Td, pPartial, moisture: Xsw, steps };
}

/** 常用温度点饱和水蒸气压速查（整数点查表值） */
export function vaporTable(temps: number[]): { t: number; p: number }[] {
  return temps.map((t) => ({ t, p: SAT_TABLE[Math.min(100, Math.max(0, Math.round(t)))] }));
}

export const MOISTURE_DEMO: MoistureInput = {
  temperature: 25.3,
  humidity: 60,
  atmospheric: 101.325,
  gauge: 0,
  method: 1,
};
