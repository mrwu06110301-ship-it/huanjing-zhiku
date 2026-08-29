/**
 * rc-moisture.ts — 阻容含湿量模型计算引擎
 *
 * 阻容法测湿：电阻测温度、电容测相对湿度（高分子薄膜电容随环境水汽变化），
 * 传感器输出 T（温度）+ RH（相对湿度），含湿量（体积分数）需经水蒸气分压换算。
 *
 * 两种水蒸气分压计算路径：
 *  方式1（饱和蒸汽压法）：
 *   (1) P饱和 = f(T) —— Buck 公式：P饱和 = 0.61121 × exp((18.678 − T/234.5) × T/(257.14 + T)) kPa
 *       （0~100℃ 精度 ±0.06%，等效查饱和水蒸气压表）
 *   (2) P分压 = P饱和 × RH(%)/100
 *   (3) 含湿量 Xsw(体积比%) = P分压 / P当前 × 100
 *
 *  方式2（露点法）：
 *   (1) 由 T、RH 计算露点 Td（Magnus-Tetens：Td = 243.04×α/(17.625−α)，α = ln(RH/100)+17.625T/(243.04+T)）
 *   (2) P分压 = P饱和(Td)（露点温度对应的饱和水蒸气压——即当前实际水蒸气分压）
 *   (3) 含湿量 Xsw = P分压 / P当前 × 100
 *
 * 两种方式结果一致（露点法是饱和蒸汽压法的等价变形），现场仪器多用方式1。
 */

/** Buck 公式：饱和水蒸气压 kPa（0~100℃，精度 ±0.06%） */
export function saturationVaporPressure(tC: number): number {
  return 0.61121 * Math.exp(((18.678 - tC / 234.5) * tC) / (257.14 + tC));
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
  pressure: number;    // 当前气压（kPa，烟气绝对压或环境大气压）
  method?: 1 | 2;      // 计算方式：1 饱和蒸汽压法；2 露点法
}

export interface MoistureResult {
  pSat: number;        // T 对应饱和水蒸气压 kPa
  pDew: number;        // 露点对应饱和水蒸气压 kPa（= 实际水蒸气分压，方式2）
  dewPoint: number;    // 露点 ℃
  pPartial: number;    // 水蒸气分压 kPa
  moisture: number;    // 含湿量 Xsw（体积比 %）
  steps: string[];
}

export function computeMoisture(input: MoistureInput): MoistureResult {
  const { temperature: T, humidity: RH, pressure: P, method = 1 } = input;
  const steps: string[] = [];

  const pSatT = saturationVaporPressure(T);
  steps.push(
    `① P饱和(T=${T}℃) = 0.61121 × exp((18.678 − T/234.5) × T/(257.14 + T)) = ${pSatT.toFixed(4)} kPa（查饱和水蒸气压表/Buck 公式）`
  );

  const Td = dewPoint(T, RH);
  const pDew = saturationVaporPressure(Td);
  steps.push(
    `② 露点 Td = 243.04×ln(RH/100×exp(17.625T/(T+243.04))) / (17.625 − …) = ${Td.toFixed(2)} ℃`
  );

  let pPartial: number;
  if (method === 1) {
    pPartial = pSatT * (RH / 100);
    steps.push(
      `③ 方式1：P分压 = P饱和 × RH/100 = ${pSatT.toFixed(4)} × ${RH}% = ${pPartial.toFixed(4)} kPa`
    );
  } else {
    pPartial = pDew;
    steps.push(
      `③ 方式2：P分压 = P饱和(Td=${Td.toFixed(2)}℃) = ${pDew.toFixed(4)} kPa（露点对应的饱和蒸汽压即实际水蒸气分压）`
    );
  }

  const Xsw = (pPartial / P) * 100;
  steps.push(
    `④ 含湿量 Xsw = P分压/P当前 × 100 = ${pPartial.toFixed(4)}/${P} × 100 = ${Xsw.toFixed(3)} %`
  );
  steps.push(
    `⑤ 露点 ${Td.toFixed(2)}℃ 交叉验证：P饱和(Td)/P = ${((pDew / P) * 100).toFixed(3)} %${Math.abs(pDew / P * 100 - Xsw) < 0.05 ? "（与方式1一致）" : ""}`
  );

  return { pSat: pSatT, pDew, dewPoint: Td, pPartial, moisture: Xsw, steps };
}

/** 常用温度点饱和水蒸气压速查（kPa，Magnus 计算） */
export function vaporTable(temps: number[]): { t: number; p: number }[] {
  return temps.map((t) => ({ t, p: saturationVaporPressure(t) }));
}

export const MOISTURE_DEMO: MoistureInput = {
  temperature: 25.0,
  humidity: 60,
  pressure: 101.325,
  method: 1,
};
