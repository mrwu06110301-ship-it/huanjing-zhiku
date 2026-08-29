/**
 * atmospheric-sampling.ts — 大气采样模型计算引擎
 *
 * 依据：
 *  - JJG 956-2013《大气采样器检定规程》（大气采样器：入口/标况/参比/刻度流量）
 *  - JJG 1169-2019《烟气采样器检定规程》（烟气采样器：入口/标况流量）
 *
 * 流量定义：
 *  - 入口流量 Q入：环境温度、实测大气压下的流量（采样器入口状态）
 *  - 标况流量 Q标：0℃、101.325 kPa 标准状态
 *  - 参比流量 Q参比：25℃、101.325 kPa
 *  - 刻度流量 Q刻：20℃、实测大气压（流量计刻度状态，需扣除管路计前负压 Pf）
 *
 * 采样体积换算核心规则（设备累计体积的归属）：
 *  (1) 流量设置为「刻度」时 → 累计体积为刻度流量体积
 *  (2) 流量设置为「入口」时 → 累计体积为入口流量体积
 *  (3) 流量设置为「标况」时 → 累计体积为【标况体积】（V标=累计值，反推入口体积供参考）
 */

// kPa → Pa
const KPA = 1000;

/** 摄氏度 → 热力学温度 K */
export function toK(tC: number): number {
  return tC + 273.15;
}

export interface FlowConvertInput {
  Q: number;          // 已知流量 L/min
  from: FlowKind;     // 已知流量种类
  to: FlowKind;       // 目标流量种类
  temperature: number; // 环境温度 ℃（实测）
  pressure: number;    // 大气压 kPa（实测）
  gaugePressure?: number; // 计前负压 Pf kPa（仅刻度流量参与，取绝对值输入，如 16.45）
}

export type FlowKind = "inlet" | "normal" | "reference" | "scale";

export const FLOW_LABEL: Record<FlowKind, string> = {
  inlet: "入口流量",
  normal: "标况流量",
  reference: "参比流量",
  scale: "刻度流量",
};

/**
 * 任意两种流量互算。
 * 思路：先把已知流量统一折算为「入口流量」，再从入口流量折算到目标流量。
 */
export function convertFlow(input: FlowConvertInput): number {
  const { Q, from, to, temperature, pressure } = input;
  const T = toK(temperature);
  const P = pressure;
  const Ps = 101.325; // kPa 标准大气压

  // —— 第一步：折算为入口流量 Q_in ——
  let Qin: number;
  switch (from) {
    case "inlet":
      Qin = Q;
      break;
    case "normal":
      // Q标 = Q入 × P/101.325 × 273.15/(T+273.15)  → 反解
      Qin = Q / ((P / Ps) * (273.15 / T));
      break;
    case "reference":
      // Q参比 = Q入 × P/101.325 × (25+273.15)/(T+273.15)  → 反解
      Qin = Q / ((P / Ps) * (toK(25) / T));
      break;
    case "scale": {
      // Q刻 = Q入 × P/√(Ps×(P−Pf)) × √((273.15+20)/T)  → 反解
      const Pf = Math.abs(input.gaugePressure ?? 0);
      const factor = (P / Math.sqrt(Ps * (P - Pf))) * Math.sqrt(toK(20) / T);
      Qin = Q / factor;
      break;
    }
  }

  // —— 第二步：从入口流量折算到目标 ——
  switch (to) {
    case "inlet":
      return Qin;
    case "normal":
      return Qin * (P / Ps) * (273.15 / T);
    case "reference":
      return Qin * (P / Ps) * (toK(25) / T);
    case "scale": {
      const Pf = Math.abs(input.gaugePressure ?? 0);
      return Qin * (P / Math.sqrt(Ps * (P - Pf))) * Math.sqrt(toK(20) / T);
    }
  }
}

// ==================== 采样体积换算 ====================

export type FlowSetting = "scale" | "inlet" | "normal";

export const FLOW_SETTING_LABEL: Record<FlowSetting, string> = {
  scale: "刻度流量",
  inlet: "入口流量",
  normal: "标况流量",
};

export interface VolumeConvertInput {
  flowSetting: FlowSetting; // 设备流量设置方式
  accumulatedVolume: number; // 设备累计体积 L
  temperature: number;       // 环境温度 ℃
  pressure: number;          // 大气压 kPa
  gaugePressure?: number;    // 计前负压 kPa（刻流模式需要）
}

export interface VolumeConvertResult {
  inletVolume: number;   // 入口流量体积 L（中间量）
  normalVolume: number;  // 标况体积 L（最终目标）
  referenceVolume: number; // 参比体积 L（附加参考）
  steps: string[];       // 计算过程说明
}

/**
 * 采样累计体积 → 标况体积。
 * 规则（来自设备采样逻辑）：
 *  - 流量设置为「刻度」：累计体积=刻度流量体积，需先反推入口体积
 *  - 流量设置为「入口」：累计体积=入口流量体积，直接换算
 *  - 流量设置为「标况」：累计体积=标况体积，V标=累计值（反推入口体积供参考）
 */
export function convertVolume(input: VolumeConvertInput): VolumeConvertResult {
  const { flowSetting, accumulatedVolume: V, temperature, pressure } = input;
  const T = toK(temperature);
  const P = pressure;
  const Ps = 101.325;
  const steps: string[] = [];

  let Vin: number;
  if (flowSetting === "scale") {
    // 刻流模式：V刻 ÷ [P/√(Ps(P−Pf)) × √(293.15/T)] = V入
    const Pf = Math.abs(input.gaugePressure ?? 0);
    const factor = (P / Math.sqrt(Ps * (P - Pf))) * Math.sqrt(toK(20) / T);
    Vin = V / factor;
    steps.push(
      `流量设置为刻度：累计体积 ${V} L 为刻度流量体积，先反推入口体积`,
      `V入 = V刻 ÷ [P/√(Ps×(P−Pf)) × √((273.15+20)/T)] = ${V} ÷ ${factor.toFixed(5)} = ${Vin.toFixed(4)} L`
    );
  } else if (flowSetting === "normal") {
    // 标况设置：累计体积即为标况体积，反推入口体积（用于展示与参比换算）
    const f = (P / Ps) * (273.15 / T);
    Vin = V / f;
    steps.push(
      `流量设置为标况：累计体积 ${V} L 即为标况体积（V标 = ${V} L）`,
      `反推入口体积 V入 = V标 ÷ [P/101.325 × 273.15/(T+273.15)] = ${V} ÷ ${f.toFixed(5)} = ${Vin.toFixed(4)} L`
    );
  } else {
    // 入口设置：累计体积即为入口流量体积
    Vin = V;
    steps.push(`流量设置为入口：累计体积即为入口流量体积，V入 = ${V} L`);
  }

  // V标 = V入 × P/101.325 × 273.15/(T+273.15)
  const Vn = Vin * (P / Ps) * (273.15 / T);
  steps.push(
    `V标 = V入 × P/101.325 × 273.15/(T+273.15) = ${Vin.toFixed(4)} × ${(P / Ps).toFixed(5)} × ${(273.15 / T).toFixed(5)} = ${Vn.toFixed(2)} L`
  );

  // V参比 = V入 × P/101.325 × (25+273.15)/(T+273.15)
  const Vr = Vin * (P / Ps) * (toK(25) / T);

  return { inletVolume: Vin, normalVolume: Vn, referenceVolume: Vr, steps };
}

// ==================== 预置验证实例 ====================
/** 实例1（烟气采样器，入口流设置）：3.28 L × 100.91 kPa / 26.1℃ → 标况 2.98 L */
export const DEMO_INLET: VolumeConvertInput = {
  flowSetting: "inlet",
  accumulatedVolume: 3.28,
  temperature: 26.1,
  pressure: 100.91,
};

/** 实例2（大气采样器，刻流设置）：2.90 L × 100.93 kPa / 27.7℃ / Pf 16.45 kPa → 标况 2.41~2.43 L */
export const DEMO_SCALE: VolumeConvertInput = {
  flowSetting: "scale",
  accumulatedVolume: 2.9,
  temperature: 27.7,
  pressure: 100.93,
  gaugePressure: 16.45,
};
