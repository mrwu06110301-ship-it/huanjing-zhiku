/**
 * unit-gas-conversion.ts — 气体单位换算引擎
 *
 * 1) 常用气体换算：ppm / mg/m³ / μmol/mol / % / ppb 互转（经 ppm 中转）
 * 2) VOCs 气体换算：ppm / mg/m³ / ppm(C) / mg/m³(C) / ppm(CH4) / mg/m³(CH4) 互转
 *    - 以碳计：nC × 12.011；以甲烷计：nC × 16.043（等效甲烷）
 *    - 总烃无确定分子式 → 只支持碳计 ↔ 甲烷计（比值恒为 16.043/12.011）
 *
 * 换算基准：
 *  - 25℃、101.325 kPa：摩尔体积 24.45 L/mol（参比状态，GB/T 16157 附录）
 *  - 0℃、101.325 kPa：摩尔体积 22.41 L/mol（标准状态）
 *  - mg/m³ = ppm × M / Vm；ppm = mg/m³ × Vm / M
 */

export const MOLAR_VOLUME: Record<"25C" | "0C", number> = {
  "25C": 24.45,
  "0C": 22.414,
};

// ==================== 元素周期表（分子质量计算） ====================
const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011,
  N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
  K: 39.098, Ca: 40.078, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938,
  Fe: 55.845, Ni: 58.693, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.87,
  I: 126.90, Ba: 137.33, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2,
};

/** 解析分子式 → 摩尔质量 g/mol；解析失败返回 null */
export function parseMolarMass(formula: string): number | null {
  const f = formula.replace(/\s+/g, "").replace(/[（(].*?[)）]/g, "");
  if (!f) return null;
  // 匹配 元素[数字] 序列；支持嵌套括号（一层）如 Ca(OH)2
  const tokens: { mass: number; count: number }[] = [];
  const s = f;
  let i = 0;
  const readNumber = (): number => {
    let n = "";
    while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
    return n ? Number(n) : 1;
  };
  const readGroup = (depth: number): boolean => {
    while (i < s.length) {
      const ch = s[i];
      if (ch === "(") {
        i++;
        const start = tokens.length;
        if (!readGroup(depth + 1)) return false;
        const cnt = readNumber();
        for (let k = start; k < tokens.length; k++) tokens[k].count *= cnt;
      } else if (ch === ")") {
        i++;
        return true;
      } else if (/[A-Z]/.test(ch)) {
        let el = ch;
        i++;
        while (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        const mass = ATOMIC_MASS[el];
        if (mass === undefined) return false;
        tokens.push({ mass, count: readNumber() });
      } else {
        return false;
      }
    }
    return depth === 0;
  };
  if (!readGroup(0) || i < s.length || tokens.length === 0) return null;
  return tokens.reduce((sum, t) => sum + t.mass * t.count, 0);
}

// ==================== 常用气体库 ====================
export interface GasDef {
  name: string;       // 中文名
  formula: string;    // 分子式
  molarMass: number;  // 摩尔质量 g/mol
}

function G(name: string, formula: string): GasDef {
  const m = parseMolarMass(formula);
  if (m === null) throw new Error(`分子式解析失败: ${formula}`);
  return { name, formula, molarMass: Math.round(m * 1000) / 1000 };
}

/** 常用气体（监测常见） */
export const COMMON_GASES: GasDef[] = [
  G("一氧化氮", "NO"),
  G("二氧化氮", "NO2"),
  G("二氧化硫", "SO2"),
  G("一氧化碳", "CO"),
  G("氨", "NH3"),
  G("甲烷", "CH4"),
  G("氯化氢", "HCl"),
  G("硫化氢", "H2S"),
  G("二氧化碳", "CO2"),
  G("氧化亚氮", "N2O"),
  G("六氟化硫", "SF6"),
  G("氧气", "O2"),
  G("臭氧", "O3"),
  G("氰化氢", "HCN"),
  G("氯气", "Cl2"),
  G("氟化氢", "HF"),
  G("甲醛", "CH2O"),
  G("氯化氢（盐酸雾）", "HCl"),
];

// ==================== 常用气体单位换算 ====================
export type CommonUnit = "ppm" | "mgm3" | "umolmol" | "pct" | "ppb";

export const COMMON_UNIT_LABEL: Record<CommonUnit, string> = {
  ppm: "ppm",
  mgm3: "mg/m³",
  umolmol: "μmol/mol",
  pct: "%",
  ppb: "ppb",
};

/** 任意单位 → ppm（μmol/mol 与 ppm 数值相同） */
function toPpm(value: number, unit: CommonUnit): number {
  switch (unit) {
    case "ppm": return value;
    case "umolmol": return value;             // 1 μmol/mol = 1 ppm（体积比）
    case "ppb": return value / 1000;
    case "pct": return value * 10000;          // 1% = 10000 ppm
  }
}

/** ppm → 任意单位 */
function fromPpm(ppm: number, unit: CommonUnit): number {
  switch (unit) {
    case "ppm": return ppm;
    case "umolmol": return ppm;
    case "ppb": return ppm * 1000;
    case "pct": return ppm / 10000;
  }
}

export interface CommonConvertInput {
  value: number;
  from: CommonUnit;
  to: CommonUnit;
  molarMass: number;   // g/mol
  temp: "25C" | "0C";  // 摩尔体积基准
}

/** 常用气体换算：任意单位对互转 */
export function convertCommon(input: CommonConvertInput): number {
  const { value, from, to, molarMass, temp } = input;
  const Vm = MOLAR_VOLUME[temp];
  const ppm = toPpm(value, from);
  if (to === "ppm" || to === "umolmol") return fromPpm(ppm, to);
  if (to === "ppb") return fromPpm(ppm, to);
  if (to === "pct") return fromPpm(ppm, to);
  // to === mgm3
  if (from === "mgm3") {
    // mg/m³ → ppm → mg/m³（相同单位直接返回）
    return value;
  }
  // ppm 系 → mg/m³
  return (ppm * molarMass) / Vm;
}

/** mg/m³ → ppm 系（统一入口，处理 from=mgm3） */
export function convertCommonSafe(input: CommonConvertInput): number {
  const { value, from, to, molarMass, temp } = input;
  const Vm = MOLAR_VOLUME[temp];
  let ppm: number;
  switch (from) {
    case "mgm3": ppm = (value * Vm) / molarMass; break;
    default: ppm = toPpm(value, from);
  }
  switch (to) {
    case "mgm3": return (ppm * molarMass) / Vm;
    default: return fromPpm(ppm, to);
  }
}

// ==================== VOCs 换算 ====================
export type VocUnit =
  | "ppm" | "mgm3"
  | "ppmC" | "mgm3C"      // 以碳计
  | "ppmCH4" | "mgm3CH4"; // 以甲烷计（等效甲烷）

export const VOC_UNIT_LABEL: Record<VocUnit, string> = {
  ppm: "ppm",
  mgm3: "mg/m³",
  ppmC: "ppm(C)",
  mgm3C: "mg/m³(C)",
  ppmCH4: "ppm(CH₄)",
  mgm3CH4: "mg/m³(CH₄)",
};

export interface VocGasDef {
  name: string;
  formula: string;
  carbonCount: number;  // 碳原子数 nC
  molarMass: number | null; // 总烃为 null（无确定分子式）
}

/** VOCs 气体库（甲烷/非甲烷总烃监测常见） */
export const VOC_GASES: VocGasDef[] = [
  { name: "甲烷", formula: "CH4", carbonCount: 1, molarMass: 16.043 },
  { name: "丙烷", formula: "C3H8", carbonCount: 3, molarMass: 44.097 },
  { name: "苯", formula: "C6H6", carbonCount: 6, molarMass: 78.114 },
  { name: "甲苯", formula: "C7H8", carbonCount: 7, molarMass: 92.141 },
  { name: "二甲苯", formula: "C8H10", carbonCount: 8, molarMass: 106.167 },
  { name: "乙苯", formula: "C8H10", carbonCount: 8, molarMass: 106.167 },
  { name: "苯乙烯", formula: "C8H8", carbonCount: 8, molarMass: 104.152 },
  { name: "三甲苯", formula: "C9H12", carbonCount: 9, molarMass: 120.194 },
  { name: "总烃", formula: "-", carbonCount: null, molarMass: null },
];

const M_C = 12.011;    // 碳原子质量
const M_CH4 = 16.043;  // 甲烷摩尔质量

export interface VocConvertInput {
  value: number;
  from: VocUnit;
  to: VocUnit;
  gas: VocGasDef;
  temp: "25C" | "0C";
}

/**
 * VOCs 换算：全部单位经「mg/m³(C) 以碳计」中转（与气体种类无关的公共锚点）
 *
 * 换算链：
 *  ppm      ↔ mg/m³    ：需 M（总烃不支持）
 *  ppm      ↔ ppmC    ：ppmC = ppm × nC（需 nC；总烃不支持）
 *  mg/m³    ↔ mg/m³C  ：mg/m³C = mg/m³ × nC×12.011/M（需 M；总烃不支持）
 *  ppmC     ↔ mg/m³C  ：Vm × 12.011（碳计，与气体无关）
 *  ppmCH4   ↔ mg/m³CH4：Vm × 16.043（甲烷计，与气体无关）
 *  ppmC     ↔ ppmCH4  ：比值 12.011/16.043（与气体无关）
 *  mg/m³C   ↔ mg/m3CH4：比值 12.011/16.043
 */
export function convertVoc(input: VocConvertInput): number | null {
  const { value, from, to, gas, temp } = input;
  if (from === to) return value;
  const Vm = MOLAR_VOLUME[temp];
  const nC = gas.carbonCount;
  const M = gas.molarMass;
  const isTHC = gas.name === "总烃";

  // —— 第一步：折算为 mg/m³(C) ——
  let asMgm3C: number;
  switch (from) {
    case "ppm": {
      if (M === null || nC === null) return null; // 总烃无 ppm
      asMgm3C = (value * M / Vm) * (nC * M_C / M); // ppm→mg/m³→mg/m³(C)
      break;
    }
    case "mgm3": {
      if (M === null || nC === null) return null;
      asMgm3C = value * (nC * M_C / M);
      break;
    }
    case "ppmC":
      asMgm3C = (value * M_C) / Vm;
      break;
    case "mgm3C":
      asMgm3C = value;
      break;
    case "ppmCH4":
      asMgm3C = (value * M_CH4 / Vm) * (M_C / M_CH4); // = value × M_C / Vm，与 ppmC 相同数值口径
      break;
    case "mgm3CH4":
      asMgm3C = value * (M_C / M_CH4);
      break;
  }

  // —— 第二步：从 mg/m³(C) 折算到目标 ——
  switch (to) {
    case "ppm": {
      if (M === null || nC === null) return null;
      const mgm3 = asMgm3C / (nC * M_C / M);
      return (mgm3 * Vm) / M;
    }
    case "mgm3": {
      if (M === null || nC === null) return null;
      return asMgm3C / (nC * M_C / M);
    }
    case "ppmC":
      return (asMgm3C * Vm) / M_C;
    case "mgm3C":
      return asMgm3C;
    case "ppmCH4":
      return (asMgm3C * Vm) / M_C; // 与 ppmC 同数值（甲烷计 ppm = 碳计 ppm × 12.011/16.043 × 16.043/12.011）
    case "mgm3CH4":
      return asMgm3C / (M_C / M_CH4);
  }
}

/** 单位是否对该气体可用（总烃：仅碳计/甲烷计） */
export function vocUnitAvailable(gas: VocGasDef, unit: VocUnit): boolean {
  if (gas.name !== "总烃") return true;
  return unit === "ppmC" || unit === "mgm3C" || unit === "ppmCH4" || unit === "mgm3CH4";
}
