/**
 * atmospheric-stability.ts — 大气稳定度计算引擎（纯前端）
 *
 * 计算依据：
 * - HJ/T 55-2000《大气污染物无组织排放监测技术导则》
 *   · 附录B 太阳倾角（赤纬）近似公式 / 太阳高度角公式
 *   · 表3 太阳辐射等级查取（云量 + 太阳高度角）
 *   · 表4 大气稳定度等级（地面风速 × 太阳辐射等级）
 *   · 各种稳定度条件下的风廓线幂指数 n（城市/乡村）
 *   · 表5 风向变化的适宜程度分类（风向标准差 σθ）
 *   · 表6 风速的适宜程度分类（平均风速）
 *   · 表7 大气稳定度的适宜程度分类（稳定度等级）
 *   · 8.5.2 总适宜度 = 三项中适宜程度最差的一类
 *   · 8.5.3 任一项为 d 或两项为 c → 应取消或更换日期
 *   · 8.1 a/b/c/d 四类含义
 * - 风向标准差：Yamartino(1984) 算法（《三种实时计算风向标准差方法的比较》）
 * - 平均风向：单位矢量平均（0/360 环形量）
 *
 * 参考实现：青岛众瑞-孟维鹏《大气稳定度计算逻辑梳理》及手工验证 Excel。
 */

// ====================== 类型定义 ======================

export interface MinuteRecord {
  windSpeed: number; // 风速 m/s
  windDir: number; // 风向 °（0-360）
  pressure: number; // 大气压 hPa（或 kPa，仅记录展示）
  temperature: number; // 温度 ℃
  humidity: number; // 湿度 %RH
}

export interface StabilityInput {
  measureTime: string; // 测量时间 ISO / "YYYY-MM-DD HH:mm:ss"（取结束时间）
  longitude: number; // 经度 °（东经为正）
  latitude: number; // 纬度 °（北纬为正）
  measureHeight: number; // 测量高度 m（风速仪离地高度）
  totalCloud: number; // 总云量（0-10，十分制）
  lowCloud: number; // 低云量（0-10，十分制）
  region: "urban" | "rural"; // 区域：城市 / 农村
  records: MinuteRecord[]; // 分钟过程数据（通常 10 组）
}

export interface StabilityResult {
  // ---- 平均量 ----
  avgWindSpeed: number;
  avgWindDir: number; // 矢量平均风向 °
  avgTemperature: number;
  avgHumidity: number;
  avgPressure: number;
  // ---- 过程中间量 ----
  dayInYear: number; // 日期序号 dn（1-365/366）
  earthRotationAngle: number; // 地球公转角 Q0（弧度）
  sunDipAngle: number; // 太阳倾角 δ（度）
  sunElevation: number; // 太阳高度角 h0（度）
  isNight: boolean; // 是否夜间
  radiationLevel: number; // 太阳辐射等级（-3 ~ +3，实际 -2~+3）
  windDirStdDev: number; // 风向标准差 σθ（Yamartino，度）
  windProfileExponent: number; // 风廓线幂指数 n
  windSpeed10m: number; // 换算 10m 地面风速 m/s
  stabilityPredicted: string; // 稳定度预测等级（平均风速+辐射等级 → 表4）
  stabilityLevel: string; // 大气稳定度等级（10m 风速+辐射等级 → 表4）
  // ---- 适宜度 ----
  stabilitySuitability: string; // 大气稳定适宜度 a/b/c/d
  windDirSuitability: string; // 风向变化适宜度 a/b/c/d
  windSpeedSuitability: string; // 风速适宜度 a/b/c/d
  totalSuitability: string; // 总适宜度 a/b/c/d
  conclusion: string; // 结论判定文字
  shouldCancel: boolean; // 8.5.3 是否应取消监测
  cancelReason: string; // 取消原因说明
}

// ====================== 工具函数 ======================

const rad = (deg: number) => (deg / 180) * Math.PI;
const deg = (r: number) => (r / Math.PI) * 180;

/**
 * 日期序数 dn（0 起点计数：1月1日=0，与 HJ/T 55 附录B 及参考实现一致）
 * 注：PDF 参考资料明确"dn = 一年中的日期序数 0,1,2,……364"
 */
export function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

/** 是否闰年（仅用于展示说明；公转角按 365 计算，与参考实现一致） */
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * 太阳倾角（赤纬）δ，度 — HJ/T 55 附录B Cooper 近似式
 * δ = [0.006918 - 0.399912cosQ0 + 0.0702578sinQ0 - 0.006758cosQ0
 *      + 0.000907sin2Q0 - 0.002697cos3Q0 + 0.00148sin3Q0] × 180/π
 * （注：第三项 -0.006758cosQ0 与首项重复为标准原式，照标准保留）
 */
export function sunDipAngle(earthRotationAngle: number): number {
  const q = earthRotationAngle;
  return (
    (0.006918 -
      0.399912 * Math.cos(q) +
      0.0702578 * Math.sin(q) -
      0.006758 * Math.cos(q) +
      0.000907 * Math.sin(2 * q) -
      0.002697 * Math.cos(3 * q) +
      0.00148 * Math.sin(3 * q)) *
    180 /
    Math.PI
  );
}

/**
 * 太阳高度角 h0，度 — HJ/T 55 式(2)
 * h0 = arcsin[sinφ·sinδ + cosφ·cosδ·cos(15t + λ - 300)]
 * t：北京时间（24h 制，可用小数）；φ 纬度；λ 经度；δ 太阳倾角
 */
export function sunElevationAngle(
  latitude: number,
  longitude: number,
  sunDip: number,
  hourDecimal: number
): number {
  const s =
    Math.sin(rad(latitude)) * Math.sin(rad(sunDip)) +
    Math.cos(rad(latitude)) *
      Math.cos(rad(sunDip)) *
      Math.cos(rad(15 * hourDecimal + longitude - 300));
  // 数值截断到 [-1,1] 防 NaN
  const c = Math.max(-1, Math.min(1, s));
  return deg(Math.asin(c));
}

/**
 * 平均风向 — 单位矢量平均
 * θ̄ = atan2( mean(sinθ), mean(cosθ) )，映射到 [0,360)
 */
export function meanWindDir(dirs: number[]): number {
  const n = dirs.length;
  if (n === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const d of dirs) {
    sinSum += Math.sin(rad(d));
    cosSum += Math.cos(rad(d));
  }
  const m = deg(Math.atan2(sinSum / n, cosSum / n));
  return (m + 360) % 360;
}

/**
 * 风向标准差 σθ — Yamartino (1984) 算法（式17）
 * E² = 1 - (Msinθ² + Mcosθ²)
 * σθ = [1.0 + (2/√3 - 1)·E³]·arcsin(E)
 */
export function yamartinoStdDev(dirs: number[]): number {
  const n = dirs.length;
  if (n < 2) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const d of dirs) {
    sinSum += Math.sin(rad(d));
    cosSum += Math.cos(rad(d));
  }
  const ms = sinSum / n;
  const mc = cosSum / n;
  const e2 = 1 - (ms * ms + mc * mc);
  const e = Math.sqrt(Math.max(0, e2));
  return (1.0 + (2 / Math.sqrt(3) - 1) * Math.pow(e, 3)) * deg(Math.asin(e));
}

// ====================== 查表数据 ======================

/**
 * 表3 太阳辐射等级（HJ/T 55-2000）
 * 行：云量组合（1=总/低≤4；2=5~7/≤4；3=≥8/≤4；4=≥5/5~7；5=≥8/≥8）
 * 列：夜间 | h0≤15 | 15<h0≤35 | 35<h0≤65 | h0>65
 */
const RADIATION_TABLE: number[][] = [
  [-2, -1, +1, +2, +3], // ≤4/≤4
  [-1, 0, +1, +2, +3], // 5~7/≤4
  [-1, 0, 0, +1, +1], // ≥8/≤4
  [0, 0, 0, 0, +1], // ≥5/5~7
  [0, 0, 0, 0, 0], // ≥8/≥8
];

/** 云量组合行号判定（0-10 十分制） */
export function cloudRow(totalCloud: number, lowCloud: number): number {
  if (totalCloud <= 4 && lowCloud <= 4) return 0;
  if (totalCloud >= 5 && totalCloud <= 7 && lowCloud <= 4) return 1;
  if (totalCloud >= 8 && lowCloud <= 4) return 2;
  if (totalCloud >= 5 && totalCloud <= 7 && lowCloud >= 5) return 3;
  if (totalCloud >= 8 && lowCloud >= 8) return 4;
  return -1; // 组合不合法（总<低 等）
}

/**
 * 太阳辐射等级查取
 * 夜间取"夜间"列；白天按太阳高度角分档（≤15 / 15~35 / 35~65 / >65）
 */
export function radiationLevel(
  totalCloud: number,
  lowCloud: number,
  sunElev: number,
  night: boolean
): { level: number; error?: string } {
  const row = cloudRow(totalCloud, lowCloud);
  if (row < 0) return { level: NaN, error: "云量组合不合法（总云量小于低云量或超出范围）" };
  const col = night ? 0 : sunElev <= 15 ? 1 : sunElev <= 35 ? 2 : sunElev <= 65 ? 3 : 4;
  return { level: RADIATION_TABLE[row][col] };
}

/**
 * 表4 大气稳定度等级（地面风速 × 太阳辐射等级 → A~F）
 * 行风速档：≤1.9 / 2~2.9 / 3~4.9 / ≥6；列：+3 +2 +1 0 -1 -2
 */
const STABILITY_TABLE: string[][] = [
  ["A", "A-B", "B", "D", "E", "F"], // ≤1.9
  ["A-B", "B", "C", "D", "E", "F"], // 2~2.9
  ["B", "B-C", "C", "D", "D", "E"], // 3~4.9
  ["D", "D", "D", "D", "D", "D"], // ≥6
];

/** 表4 查取（风速用 10 分钟平均/换算后 10m 风速） */
export function stabilityGrade(windSpeed: number, radiation: number): string {
  const row = windSpeed < 2 ? 0 : windSpeed < 3 ? 1 : windSpeed < 6 ? 2 : 3;
  // 列：+3→0, +2→1, +1→2, 0→3, -1→4, -2→5
  const colMap: Record<number, number> = { 3: 0, 2: 1, 1: 2, 0: 3, "-1": 4, "-2": 5 };
  const col = colMap[radiation];
  if (col === undefined) return "-";
  return STABILITY_TABLE[row][col];
}

/**
 * 风廓线幂指数 n（各种稳定度条件下）
 * 城市：A 0.10 / B 0.15 / C 0.20 / D 0.25 / EF 0.30
 * 乡村：A 0.07 / B 0.07 / C 0.10 / D 0.15 / EF 0.25
 */
export function windProfileExponent(region: "urban" | "rural", grade: string): number {
  const urban = { A: 0.1, "A-B": 0.1, B: 0.15, "B-C": 0.15, C: 0.2, D: 0.25, E: 0.3, F: 0.3 };
  const rural = { A: 0.07, "A-B": 0.07, B: 0.07, "B-C": 0.07, C: 0.1, D: 0.15, E: 0.25, F: 0.25 };
  const table = region === "urban" ? urban : rural;
  return table[grade] ?? (region === "urban" ? 0.25 : 0.15);
}

/**
 * 10m 地面风速换算 — HJ/T 55 7.1
 * Ū10 = Ūz · (10/z)^n   （z：实际测风高度 m）
 */
export function windSpeedAt10m(speed: number, height: number, n: number): number {
  if (height <= 0) return speed;
  return speed * Math.pow(10 / height, n);
}

// ====================== 适宜度判定 ======================

/** 表6 风速适宜程度：a 1.0~2.0 / b 2.1~3.0 / c 3.1~4.5 / d >4.5 */
export function windSpeedSuitability(avgSpeed: number): string {
  if (avgSpeed < 2.05) return "a"; // 1.0~2.0
  if (avgSpeed < 3.05) return "b"; // 2.1~3.0
  if (avgSpeed <= 4.5) return "c"; // 3.1~4.5
  return "d"; // >4.5
}

/** 表5 风向变化适宜程度（σθ）：a <15 / b 15~29 / c 30~45 / d >45（°） */
export function windDirSuitability(sigma: number): string {
  if (sigma < 15) return "a";
  if (sigma < 30) return "b";
  if (sigma <= 45) return "c";
  return "d";
}

/** 表7 大气稳定度适宜程度：FE→a / D→b / C→c / BA→d */
export function stabilitySuitability(grade: string): string {
  if (grade === "E" || grade === "F") return "a";
  if (grade === "D") return "b";
  if (grade === "C") return "c";
  return "d"; // A / A-B / B / B-C
}

const SUIT_DESC: Record<string, string> = {
  a: "不利于污染物的扩散和稀释，适宜于进行无组织排放监测",
  b: "较不利于污染物的扩散和稀释，较适宜于进行无组织排放监测",
  c: "有利于污染物的扩散和稀释，较不适宜于进行无组织排放监测",
  d: "很有利于污染物的扩散和稀释，不适宜于进行无组织排放监测",
};

export const SUITABILITY_DESC = SUIT_DESC;

/** 8.1 四类含义（报表用） */
export const SUITABILITY_MEANING: Record<string, string> = {
  a: "不利于污染物的扩散和稀释，适宜于进行无组织排放监测",
  b: "较不利于污染物的扩散和稀释，较适宜于进行无组织排放监测",
  c: "有利于污染物的扩散和稀释，较不适宜于进行无组织排放监测",
  d: "很有利于污染物的扩散和稀释，不适宜于进行无组织排放监测",
};

// ====================== 主计算入口 ======================

export function calcStability(input: StabilityInput): StabilityResult {
  const records = input.records.filter(
    (r) => Number.isFinite(r.windSpeed) && Number.isFinite(r.windDir)
  );
  const n = records.length;
  if (n === 0) throw new Error("无有效过程数据");

  // ---- 1. 平均量 ----
  const avgWindSpeed = records.reduce((s, r) => s + r.windSpeed, 0) / n;
  const avgTemperature = records.reduce((s, r) => s + r.temperature, 0) / n;
  const avgHumidity = records.reduce((s, r) => s + r.humidity, 0) / n;
  const avgPressure = records.reduce((s, r) => s + r.pressure, 0) / n;
  const avgWindDir = meanWindDir(records.map((r) => r.windDir));

  // ---- 2-4. 日期序号 / 公转角 / 太阳倾角 ----
  const d = new Date(input.measureTime.replace(" ", "T"));
  const dn = dayOfYear(d); // 0 起点：1月1日=0（HJ/T 55 附录B）
  const earthRotationAngle = ((360 * dn) / 365 / 180) * Math.PI;
  const sunDip = sunDipAngle(earthRotationAngle);

  // ---- 5. 太阳高度角（北京时间 24h 制小数）----
  const hourDecimal =
    d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  // 夜间判定（导则表3 仅分昼/夜；取日出日落近似：h0<0 视为夜间公式自然成立，
  // 按行业惯例以北京时间 6:00-18:00 为白天窗口，再结合 h0 分档）
  const isNight = hourDecimal < 6 || hourDecimal >= 18;
  const h0 = sunElevationAngle(input.latitude, input.longitude, sunDip, hourDecimal);

  // ---- 6. 太阳辐射等级 ----
  const rad = radiationLevel(input.totalCloud, input.lowCloud, h0, isNight);
  if (rad.error) throw new Error(rad.error);
  const radiation = rad.level;

  // ---- 7. 稳定度预测等级（平均风速 + 辐射等级）----
  const predicted = stabilityGrade(avgWindSpeed, radiation);

  // ---- 8. 风廓线幂指数 ----
  const pn = windProfileExponent(input.region, predicted);

  // ---- 9. 10m 地面风速 ----
  const u10 = windSpeedAt10m(avgWindSpeed, input.measureHeight, pn);

  // ---- 10. 大气稳定度等级（10m 风速 + 辐射等级）----
  const level = stabilityGrade(u10, radiation);

  // ---- 11-14. 三项适宜度 ----
  const wsSuit = windSpeedSuitability(avgWindSpeed);
  const wdSuit = windDirSuitability(yamartinoStdDev(records.map((r) => r.windDir)));
  const stSuit = stabilitySuitability(level);

  // ---- 15. 总适宜度（8.5.2 取最差一项：a 最差 > b > c > d 最好）----
  const rank: Record<string, number> = { a: 1, b: 2, c: 3, d: 4 };
  const worst = [wsSuit, wdSuit, stSuit].sort((x, y) => rank[x] - rank[y])[0];

  // ---- 16. 结论 + 8.5.3 取消判定 ----
  let shouldCancel = false;
  const cancelParts: string[] = [];
  const cCount = [wsSuit, wdSuit, stSuit].filter((x) => x === "c").length;
  if (worst === "d") {
    shouldCancel = true;
    cancelParts.push("任一项气象因子适宜度为 d 类");
  } else if (cCount >= 2) {
    shouldCancel = true;
    cancelParts.push("其中两项适宜度达到 c 类");
  }

  return {
    avgWindSpeed,
    avgWindDir,
    avgTemperature,
    avgHumidity,
    avgPressure,
    dayInYear: dn,
    earthRotationAngle,
    sunDipAngle: sunDip,
    sunElevation: h0,
    isNight,
    radiationLevel: radiation,
    windDirStdDev: yamartinoStdDev(records.map((r) => r.windDir)),
    windProfileExponent: pn,
    windSpeed10m: u10,
    stabilityPredicted: predicted,
    stabilityLevel: level,
    stabilitySuitability: stSuit,
    windDirSuitability: wdSuit,
    windSpeedSuitability: wsSuit,
    totalSuitability: worst,
    conclusion: SUIT_DESC[worst],
    shouldCancel,
    cancelReason: shouldCancel
      ? `依据 HJ/T 55-2000 8.5.3（${cancelParts.join("；")}），该次无组织排放监测应取消或更换日期。`
      : "",
  };
}
