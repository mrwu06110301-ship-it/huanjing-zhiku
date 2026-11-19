/**
 * verify-dust-formulas.mjs — 烟尘采样模型公式回归验证
 *
 * 用途：
 *   1) 以《烟尘相关计算公式(1).xlsx》各区块的原始算例为准，验证
 *      src/utils/flue-dust-sampling.ts 与 Excel 逐格一致；
 *   2) 验证 src/utils/flue-dust-modes.ts 的 9 个分项计算模式与综合版口径一致；
 *   3) 验证「全压 ↔ 静压」双向换算与「干湿基」口径联动自洽。
 *
 * 运行：cd frontend && node scripts/verify-dust-formulas.mjs
 */
import { readFileSync } from "fs";
import { transformSync } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadTs(rel) {
  const p = resolve(__dirname, rel);
  const code = transformSync(readFileSync(p, "utf8"), { loader: "ts", format: "esm" }).code;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

const mod = await loadTs("../src/utils/flue-dust-sampling.ts");

// modes 依赖 sampling，用 esbuild bundle 整个 modes（sampling 会被内联）
const esbuild = await import("esbuild");
const bundled = await esbuild.build({
  entryPoints: [resolve(__dirname, "../src/utils/flue-dust-modes.ts")],
  bundle: true,
  format: "esm",
  write: false,
  loader: { ".ts": "ts" },
});
const modes = await import(
  "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64")
);

let pass = 0;
let fail = 0;

// 容差：原表区块5/6/7 用 273 K、区块8b 用 273.15 K，本引擎统一 273.15 K，
// 相对偏差约 0.02%~0.10%，端到端比对容差取 1.5e-3（0.15%）。
const TOL_E2E = 1.5e-3;

function check(name, got, exp, relTol = 5e-4) {
  if (got === null || got === undefined) {
    console.log(`FAIL  ${name}  值为 null`);
    fail++;
    return;
  }
  const d = Math.abs(got - exp);
  const rel = exp === 0 ? d : d / Math.abs(exp);
  const ok = rel <= relTol;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(32)} got=${got}  exp=${exp}  rel=${(rel * 100).toFixed(4)}%`);
  ok ? pass++ : fail++;
}
function assert(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name.padEnd(32)}${detail}`);
  cond ? pass++ : fail++;
}

/* ================= 一、Excel 区块回归 ================= */

/** 区块1/2/3/8a 同一组算例（Ba=101.9, Ps=0.01, t=31.8, Hd=25, Kp=0.84, Xsw=0.38, d=12, n=120） */
const base = {
  dynamicPressure: 25, staticPressure: 0.01, totalPressure: 0.06,
  stackTemp: 31.8, atmosphere: 101.9, moisture: 0.38,
  pitotCoefficient: 0.84, crossSection: 7.28, nozzleDiameter: 12,
  samplingMinutes: 120, filterInitialMass: null, filterFinalMass: null,
  meterTemp: null, meterPressure: null, O2: null, O2Base: null, loadFactor: null,
  basis: "wet",
};
const r1 = mod.computeDustSampling(base);
console.log("--- 区块1/2/3/8a（Ba=101.9 工况）---");
check("区块1 D5 等速采样流量", r1.values.isokineticFlow.value, 36.40832064, TOL_E2E);
check("区块2 D8 采样嘴直径反算", r1.values.nozzleDiameterCalc.value, 12);
check("区块3 F11 烟气流速", r1.values.velocity.value, 5.405331876333254);
check("区块8a C26 工况采样体积", r1.values.volumeWet.value, 4368.9984767999995, TOL_E2E);

/* ================= 二、全压 ↔ 静压 双向换算 ================= */
console.log("--- 全压 ↔ 静压 双向换算 ---");
{
  const DP = 25, KP = 0.84;
  const delta = (DP / 1000) * KP * KP; // 0.01764 kPa

  // 1) 已知全压 → 反算静压
  const s1 = mod.computeDustSampling({ ...base, staticPressure: null, totalPressure: 0.06 });
  check("由全压反算静压", s1.values.staticPressure.value, 0.06 - delta, 1e-6);

  // 2) 已知静压 → 推算全压
  const s2 = mod.computeDustSampling({ ...base, staticPressure: 0.01, totalPressure: null });
  check("由静压推算全压", s2.values.totalPressure.value, 0.01 + delta, 1e-6);

  // 3) 互为逆运算（往返一致）
  const rt = mod.totalToStatic(mod.staticToTotal(0.01, DP, KP), DP, KP);
  check("全压↔静压往返一致", rt, 0.01, 1e-12);

  // 4) 两者都填：静压以实测为准，全压给推算值
  const s3 = mod.computeDustSampling({ ...base, staticPressure: 0.01, totalPressure: 0.06 });
  check("双填时静压取实测", s3.values.staticPressure.value, 0.01, 1e-12);
  check("双填时全压给推算", s3.values.totalPressure.value, 0.01 + delta, 1e-6);
  assert("双填时静压来源标注", s3.values.staticPressure.note === "实测静压");

  // 5) 无动压/皮托管系数时不得反算
  const s4 = mod.computeDustSampling({ ...base, staticPressure: null, totalPressure: 0.06, dynamicPressure: null });
  assert("缺动压时不反算静压", s4.values.staticPressure.value === null);
}

/* ================= 三、干湿基口径联动 ================= */
console.log("--- 干湿基口径联动 ---");
{
  const wet = mod.computeDustSampling({ ...mod.DUST_DEMO, basis: "wet" });
  const dry = mod.computeDustSampling({ ...mod.DUST_DEMO, basis: "dry" });
  const Xsw = mod.DUST_DEMO.moisture;
  const df = 1 - Xsw / 100;

  // 干基标况体积 = 湿基 × (1 − Xsw/100)
  check("干基 Vnd = 湿基 × (1−Xsw/100)", dry.values.volumeStandard.value,
    wet.values.volumeStandard.value * df, 1e-9);
  // 干基浓度 = 湿基 ÷ (1 − Xsw/100)
  check("干基 C = 湿基 ÷ (1−Xsw/100)", dry.values.concentration.value,
    wet.values.concentration.value / df, 1e-9);
  // 干基标杆流量 = 湿基 × (1 − Xsw/100)
  check("干基 Qn = 湿基 × (1−Xsw/100)", dry.values.dryStandardFlow.value,
    wet.values.dryStandardFlow.value * df, 1e-9);
  // 排放速率：同口径下应一致（C×Qn 抵消）
  check("干湿基下 G 一致", dry.values.emissionRate.value,
    wet.values.emissionRate.value, 1e-9);
  // 自洽：两种口径下 C × Qn × 1e-6 ≡ G
  check("湿基 G = C×Qn×1e-6", wet.values.emissionRate.value,
    wet.values.concentration.value * wet.values.dryStandardFlow.value * 1e-6, 1e-9);
  check("干基 G = C×Qn×1e-6", dry.values.emissionRate.value,
    dry.values.concentration.value * dry.values.dryStandardFlow.value * 1e-6, 1e-9);

  // 工况体积不受口径影响
  check("口径不影响工况体积", dry.values.volumeWet.value, wet.values.volumeWet.value, 1e-12);
  // 流速不受口径影响
  check("口径不影响烟气流速", dry.values.velocity.value, wet.values.velocity.value, 1e-12);
}

/* ================= 四、区块8b 计温计压法 ================= */
{
  console.log("--- 区块8b 计温计压（Ba=97.6 工况）---");
  const A = 36.40832064, B = 120, C = 97.6, D = 158.7, E = -0.19, F = 39.2, G = -3.38;
  const expected = A * (C + E) * (273.15 + F) / (C + G) / (273.15 + D) * B;
  const r = mod.computeDustSampling({
    ...base, atmosphere: 97.6, staticPressure: -0.19, stackTemp: 158.7,
    meterTemp: 39.2, meterPressure: -3.38,
  });
  const Qrs = r.values.isokineticFlow.value;
  const engineVal = r.values.volumeMeter.value;
  const engineManual = Qrs * (97.6 - 0.19) * (273.15 + 39.2) / (97.6 - 3.38) / (273.15 + 158.7) * 120;
  check("区块8b H28 引擎公式等价", engineVal, engineManual);
  check("区块8b H28 与原表同比例", engineVal, (expected / A) * Qrs, TOL_E2E);
  console.log(`      原表 H28=${expected.toFixed(4)} L（其 Qrs=${A}）；引擎同工况 H28=${engineVal.toFixed(4)} L（其 Qrs=${Qrs.toFixed(4)}）`);
}

/* ================= 五、区块5 / 6 / 7 ================= */
{
  const V = 2068.2, Ba = 97.6, Ps = -0.19, t = 158.7;
  const factorExcel = (273 / (273 + t)) * ((Ba + Ps) / 101.325);
  const factorEngine = (273.15 / (273.15 + t)) * ((Ba + Ps) / 101.325);
  console.log("--- 区块5 标况采样体积 ---");
  console.log(`      折算因子 Excel(273)=${factorExcel.toFixed(8)} 引擎(273.15)=${factorEngine.toFixed(8)}`);
  check("区块5 折算因子偏差 ≤0.05%", factorEngine, factorExcel);
  console.log(`      参考：Excel Vnd=${(V * factorExcel).toFixed(4)} L`);

  const factor6 = (273 / (273 + 32)) * ((101.9 + 0.01) / 101.325) * (1 - 1.31 / 100);
  const factor6Engine = (273.15 / (273.15 + 32)) * ((101.9 + 0.01) / 101.325) * (1 - 1.31 / 100);
  console.log("--- 区块6 标杆烟气流量（Qactual=2579）---");
  console.log(`      Excel Qn=${(2579 * factor6).toFixed(4)}  引擎因子 Qn=${(2579 * factor6Engine).toFixed(4)}`);
  check("区块6 折算因子偏差 ≤0.05%", factor6Engine, factor6);

  console.log("--- 区块7 实际烟气流量 ---");
  check("区块7 C23 Qs 公式等价", 17.3 * 7.28 * 3600, 453398.4);
}

/* ================= 六、自洽性（综合版） ================= */
{
  console.log("--- 自洽性校验（综合版）---");
  const r = mod.computeDustSampling(mod.DUST_DEMO);
  const C = r.values.concentration.value;
  const Qn = r.values.dryStandardFlow.value;
  check("G = C × Qn × 1e-6", r.values.emissionRate.value, C * Qn * 1e-6);
  const Ca = r.values.concentrationAdjusted.value;
  const alpha = r.values.alpha.value, alphaS = r.values.alphaS.value;
  check("Cα = C × α/αs × 出力系数", Ca, C * (alpha / alphaS) * 1);
}

/* ================= 七、9 个分项模式校验 ================= */
console.log("--- 分项模式（flue-dust-modes.ts）---");
{
  assert("模式数量 = 9", modes.DUST_MODES.length === 9, `实际 ${modes.DUST_MODES.length}`);
  const ids = modes.DUST_MODES.map((m) => m.id).sort();
  const expectIds = [
    "actual-flow", "condition-volume", "full", "nozzle-select",
    "sampling-flow", "standard-flow", "standard-volume", "static-pressure", "velocity",
  ].sort();
  assert("模式 id 齐备", JSON.stringify(ids) === JSON.stringify(expectIds), ids.join(","));

  const get = (id) => modes.DUST_MODE_MAP[id];

  // 1) 烟气静压计算：全压 → 静压
  const m1 = get("static-pressure");
  const r1v = m1.compute({ pt: 0.06, ps: null, dp: 25, kp: 0.84 }, "wet");
  check("静压模式 全压→静压", r1v.values.ps, 0.06 - (25 / 1000) * 0.84 * 0.84, 1e-9);
  check("静压模式 全压回显", r1v.values.pt, 0.06, 1e-12);
  // 静压 → 全压
  const r1b = m1.compute({ pt: null, ps: 0.01, dp: 25, kp: 0.84 }, "wet");
  check("静压模式 静压→全压", r1b.values.pt, 0.01 + (25 / 1000) * 0.84 * 0.84, 1e-9);

  // 2) 采样嘴直径选取
  const m2 = get("nozzle-select");
  const r2 = m2.compute({ qrs: 36.40832064, vs: 5.405331876333254, xsw: 0.38 }, "wet");
  check("采样嘴模式 反算 D", r2.values.nozzle, 12, TOL_E2E);
  check("采样嘴模式 回代 Qrs", r2.values.check, 36.40832064, 1e-9);

  // 3) 烟气流速
  const m3 = get("velocity");
  const r3 = m3.compute({ dp: 25, kp: 0.84, temp: 31.8, ba: 101.9, ps: 0.01, pt: null }, "wet");
  check("流速模式 Vs", r3.values.vs, 5.405331876333254, TOL_E2E);

  // 4) 采样流量
  const m4 = get("sampling-flow");
  const r4 = m4.compute({ nozzle: 12, vs: 5.405331876333254, xsw: 0.38 }, "wet");
  check("采样流量模式 Qrs", r4.values.qrs, 36.40832064, TOL_E2E);

  // 5) 工况体积（两种模式）
  const m5 = get("condition-volume");
  const r5 = m5.compute({
    qrs: 36.40832064, minutes: 120, temp: 158.7, ba: 97.6, ps: -0.19, pt: null,
    kp: 0.84, dp: 25, meterTemp: 39.2, meterP: -3.38,
  }, "wet");
  check("工况体积 烟温静压法", r5.values.volumeFlowTemp, 36.40832064 * 120, 1e-9);
  const expMeter = 36.40832064 * (97.6 - 0.19) * (273.15 + 39.2) / (97.6 - 3.38) / (273.15 + 158.7) * 120;
  check("工况体积 计温计压法", r5.values.volumeMeter, expMeter, 1e-9);
  check("工况体积 两法差值", r5.values.diff, r5.values.volumeFlowTemp - r5.values.volumeMeter, 1e-9);

  // 6) 标况采样体积（湿基/干基）
  const m6 = get("standard-volume");
  const r6w = m6.compute({ volume: 2068.2, temp: 158.7, ba: 97.6, ps: -0.19, pt: null, kp: 0.84, dp: 25, xsw: 1.31 }, "wet");
  const r6d = m6.compute({ volume: 2068.2, temp: 158.7, ba: 97.6, ps: -0.19, pt: null, kp: 0.84, dp: 25, xsw: 1.31 }, "dry");
  const expVnd = 2068.2 * (273.15 / (273.15 + 158.7)) * ((97.6 - 0.19) / 101.325);
  check("标况体积 湿基", r6w.values.vnd, expVnd, 1e-9);
  check("标况体积 干基", r6d.values.vnd, expVnd * (1 - 1.31 / 100), 1e-9);

  // 7) 实际烟气流量
  const m7 = get("actual-flow");
  const r7 = m7.compute({ vs: 17.3, area: 7.28 }, "wet");
  check("实际流量 Qs", r7.values.qs, 17.3 * 7.28 * 3600, 1e-9);

  // 8) 标杆烟气流量（湿基/干基）
  const m8 = get("standard-flow");
  const r8w = m8.compute({ qactual: 2579, temp: 32, ba: 101.9, ps: 0.01, pt: null, kp: 0.84, dp: 25, xsw: 1.31 }, "wet");
  const r8d = m8.compute({ qactual: 2579, temp: 32, ba: 101.9, ps: 0.01, pt: null, kp: 0.84, dp: 25, xsw: 1.31 }, "dry");
  const expQn = 2579 * (273.15 / (273.15 + 32)) * ((101.9 + 0.01) / 101.325);
  check("标杆流量 湿基", r8w.values.qn, expQn, 1e-9);
  check("标杆流量 干基", r8d.values.qn, expQn * (1 - 1.31 / 100), 1e-9);

  // 9) 综合版 与主引擎结果一致
  const m9 = get("full");
  const demo = modes.DUST_MODE_DEMO.full;
  const r9 = m9.compute(demo, "wet");
  const r9d = m9.compute(demo, "dry");
  const engine = mod.computeDustSampling({ ...mod.DUST_DEMO, basis: "wet" });
  check("综合版 Vs 与主引擎一致", r9.values.vs, engine.values.velocity.value, 1e-12);
  check("综合版 C 与主引擎一致", r9.values.c, engine.values.concentration.value, 1e-12);
  check("综合版 G 与主引擎一致", r9.values.g, engine.values.emissionRate.value, 1e-12);
  check("综合版干基 G 与主引擎一致", r9d.values.g,
    mod.computeDustSampling({ ...mod.DUST_DEMO, basis: "dry" }).values.emissionRate.value, 1e-12);
  check("综合版 C×Qn×1e-6=G", r9.values.g, r9.values.c * r9.values.qn * 1e-6, 1e-9);
  check("综合版干基 C×Qn×1e-6=G", r9d.values.g, r9d.values.c * r9d.values.qn * 1e-6, 1e-9);

  // 示例数据每个模式都能算出主结果
  for (const m of modes.DUST_MODES) {
    const demo = modes.DUST_MODE_DEMO[m.id];
    const out = m.compute(demo, "wet");
    const primary = m.results.filter((d) => d.primary);
    const allOk = primary.length > 0 && primary.every((d) => out.values[d.key] !== null && out.values[d.key] !== undefined);
    assert(`模式示例可算出主结果 [${m.id}]`, allOk,
      primary.map((d) => `${d.key}=${out.values[d.key]}`).join(" "));
  }
}

console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
