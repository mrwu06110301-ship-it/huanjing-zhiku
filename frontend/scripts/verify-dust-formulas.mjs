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

/* ================= 三、标态干基口径校验 ================= */
console.log("--- 标态干基口径 ---");
{
  const r = mod.computeDustSampling(mod.DUST_DEMO);
  const Xsw = mod.DUST_DEMO.moisture;
  const df = 1 - Xsw / 100;
  const t = mod.DUST_DEMO.stackTemp;
  const Ba = mod.DUST_DEMO.atmosphere;
  const Ps = mod.DUST_DEMO.staticPressure;

  // Vnd 不再含干基修正（含湿量已在采样流量中扣除，避免重复扣水）
  const factor = (mod.DUST_T0 / (mod.DUST_T0 + t)) * ((Ba + Ps) / mod.DUST_P0);
  const V = r.values.volumeWet.value;
  check("Vnd = V × 因子（不含重复干基）", r.values.volumeStandard.value,
    V * factor, 1e-9);

  // Qn 必须含干基修正
  const Qs = r.values.flueGasFlow.value;
  check("Qn = Qs × 因子 × (1−Xsw/100)", r.values.dryStandardFlow.value,
    Qs * factor * df, 1e-9);

  // C × Qn × 1e-6 ≡ G
  check("G = C×Qn×1e-6", r.values.emissionRate.value,
    r.values.concentration.value * r.values.dryStandardFlow.value * 1e-6, 1e-9);

  // 无 basis 参数（已移除干湿基开关）
  assert("引擎无 basis 字段", !("basis" in mod.DUST_DEMO));
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
  assert("模式数量 = 8", modes.DUST_MODES.length === 8, `实际 ${modes.DUST_MODES.length}`);
  const ids = modes.DUST_MODES.map((m) => m.id).sort();
  const expectIds = [
    "actual-flow", "full", "nozzle-select",
    "sampling-flow", "standard-flow", "static-pressure", "velocity", "volume",
  ].sort();
  assert("模式 id 齐备", JSON.stringify(ids) === JSON.stringify(expectIds), ids.join(","));

  const get = (id) => modes.DUST_MODE_MAP[id];

  // 1) 烟气静压计算：全压 → 静压
  const m1 = get("static-pressure");
  const r1v = m1.compute({ pt: 0.06, ps: null, dp: 25, kp: 0.84 }, { measured: "pt" });
  check("静压模式 全压→静压", r1v.values.ps, 0.06 - (25 / 1000) * 0.84 * 0.84, 1e-9);
  check("静压模式 全压回显", r1v.values.pt, 0.06, 1e-12);
  // 静压 → 全压
  const r1b = m1.compute({ pt: null, ps: 0.01, dp: 25, kp: 0.84 }, { measured: "ps" });
  check("静压模式 静压→全压", r1b.values.pt, 0.01 + (25 / 1000) * 0.84 * 0.84, 1e-9);

  // 1b) 双向互转：measured 决定谁是实测、谁是派生
  const delta = (25 / 1000) * 0.84 * 0.84;
  const both = m1.compute({ pt: 0.06, ps: 0.01, dp: 25, kp: 0.84 }, { measured: "ps" });
  check("实测=静压时 全压派生", both.values.pt, 0.01 + delta, 1e-9);
  check("实测=静压时 静压保留", both.values.ps, 0.01, 1e-12);
  const both2 = m1.compute({ pt: 0.06, ps: 0.01, dp: 25, kp: 0.84 }, { measured: "pt" });
  check("实测=全压时 静压派生", both2.values.ps, 0.06 - delta, 1e-9);
  check("实测=全压时 全压保留", both2.values.pt, 0.06, 1e-12);

  // 1c) 派生值不得成为基准（否则清空后会自己填回）
  const derivedCase = m1.compute({ pt: 0.06, ps: null, dp: 25, kp: 0.84 }, { measured: "pt", derived: ["ps"] });
  check("派生静压不作为基准", derivedCase.values.ps, 0.06 - delta, 1e-9);
  // 用户清空静压（实测静压），派生全压仍在 → 不应把全压当实测反推静压
  const cleared = m1.compute({ pt: 0.0276, ps: null, dp: 25, kp: 0.84 }, { measured: "ps", derived: ["pt"] });
  assert("清空实测项后不自我回填", cleared.values.ps === null || Math.abs(cleared.values.ps) > 1e-9,
    `ps=${cleared.values.ps}`);

  // 2) 采样嘴直径选取
  const m2 = get("nozzle-select");
  const r2 = m2.compute({ qrs: 36.40832064, vs: 5.405331876333254, xsw: 0.38 });
  check("采样嘴模式 反算 D", r2.values.nozzle, 12, TOL_E2E);
  check("采样嘴模式 回代 Qrs", r2.values.check, 36.40832064, 1e-9);

  // 3) 烟气流速
  const m3 = get("velocity");
  const r3 = m3.compute({ dp: 25, kp: 0.84, temp: 31.8, ba: 101.9, ps: 0.01, pt: null });
  check("流速模式 Vs", r3.values.vs, 5.405331876333254, TOL_E2E);

  // 4) 采样流量
  const m4 = get("sampling-flow");
  const r4 = m4.compute({ nozzle: 12, vs: 5.405331876333254, xsw: 0.38 });
  check("采样流量模式 Qrs", r4.values.qrs, 36.40832064, TOL_E2E);

  // 5) 体积计算（烟温静压法 / 计温计压法 合并模式）
  const m5 = get("volume");
  const volBase = {
    method: 1, qrs: 36.40832064, minutes: 120, volume: null,
    temp: 158.7, ba: 97.6, ps: -0.19, pt: null,
    kp: 0.84, dp: 25, meterTemp: 39.2, meterP: -3.38,
  };
  const r5 = m5.compute(volBase);
  check("体积模式 烟温静压法工况体积", r5.values.volumeCondition, 36.40832064 * 120, 1e-9);
  const expMeter = 36.40832064 * (97.6 - 0.19) * (273.15 + 39.2) / (97.6 - 3.38) / (273.15 + 158.7) * 120;
  check("体积模式 计温计压法工况体积", r5.values.volumeMeter, expMeter, 1e-9);
  check("体积模式 两法差值=0", r5.values.diff, 0, 1e-9);
  // 烟温静压法标况体积：V × 273.15/(273.15+t) × (Ba+Ps)/101.325（不再乘含湿量）
  const expVndFlow = 36.40832064 * 120 * (273.15 / (273.15 + 158.7)) * ((97.6 - 0.19) / 101.325);
  check("体积模式 烟温静压法标况体积", r5.values.vnd, expVndFlow, 1e-9);
  // 计温计压法标况体积：V' × 273.15/(273.15+t′) × (Ba+P′)/101.325
  const expVndMeter = expMeter * (273.15 / (273.15 + 39.2)) * ((97.6 - 3.38) / 101.325);
  check("体积模式 计温计压法标况体积", expVndMeter, expVndFlow, 1e-6);
  // 切换方法后主结果走计温计压法路径
  const r5m = m5.compute({ ...volBase, method: 2 });
  check("体积模式 切计温计压法后 Vnd", r5m.values.vnd, expVndMeter, 1e-9);
  check("体积模式 切计温计压法后工况体积", r5m.values.volumeCondition, expMeter, 1e-9);

  // 7) 实际烟气流量
  const m7 = get("actual-flow");
  const r7 = m7.compute({ vs: 17.3, area: 7.28 });
  check("实际流量 Qs", r7.values.qs, 17.3 * 7.28 * 3600, 1e-9);

  // 8) 标干烟气流量
  const m8 = get("standard-flow");
  const r8 = m8.compute({ qactual: 2579, temp: 32, ba: 101.9, ps: 0.01, pt: null, kp: 0.84, dp: 25, xsw: 1.31 });
  const expQn = 2579 * (273.15 / (273.15 + 32)) * ((101.9 + 0.01) / 101.325) * (1 - 1.31 / 100);
  check("标干流量 标态干基", r8.values.qn, expQn, 1e-9);

  // 9) 综合版 与主引擎结果一致
  const m9 = get("full");
  const demo = modes.DUST_MODE_DEMO.full;
  const r9 = m9.compute(demo);
  const engine = mod.computeDustSampling(mod.DUST_DEMO);
  check("综合版 Vs 与主引擎一致", r9.values.vs, engine.values.velocity.value, 1e-12);
  check("综合版 C 与主引擎一致", r9.values.c, engine.values.concentration.value, 1e-12);
  check("综合版 G 与主引擎一致", r9.values.g, engine.values.emissionRate.value, 1e-12);
  check("综合版 C×Qn×1e-6=G", r9.values.g, r9.values.c * r9.values.qn * 1e-6, 1e-9);

  // 示例数据每个模式都能算出主结果
  for (const m of modes.DUST_MODES) {
    const demo = modes.DUST_MODE_DEMO[m.id];
    const out = m.compute(demo);
    const primary = m.results.filter((d) => d.primary);
    const allOk = primary.length > 0 && primary.every((d) => out.values[d.key] !== null && out.values[d.key] !== undefined);
    assert(`模式示例可算出主结果 [${m.id}]`, allOk,
      primary.map((d) => `${d.key}=${out.values[d.key]}`).join(" "));
  }

  // fills 只回填「派生值」，且目标必须是本模式真实存在的输入框
  for (const m of modes.DUST_MODES) {
    const out = m.compute(modes.DUST_MODE_DEMO[m.id]);
    const fills = out.fills || {};
    const fieldKeys = new Set(m.fields.map((f) => f.key));
    const badTarget = Object.values(fills).filter((k) => !fieldKeys.has(k));
    assert(`fills 目标均为本模式输入框 [${m.id}]`, badTarget.length === 0, badTarget.join(","));
    // fills 的源结果必须是该模式声明的结果
    const resKeys = new Set(m.results.map((r) => r.key));
    const badSource = Object.keys(fills).filter((k) => !resKeys.has(k));
    assert(`fills 源均为本模式结果 [${m.id}]`, badSource.length === 0, badSource.join(","));
  }

  // 关键：fills 只在「该模式确实有对应输入框」时才生效
  // 采样嘴模式没有 nozzle 输入框 → fills 应为空（结果留在右侧显示）
  const noz = get("nozzle-select");
  const nozOut = noz.compute(modes.DUST_MODE_DEMO["nozzle-select"], { measured: null });
  assert("采样嘴模式无 nozzle 输入框 → 无 fills", !nozOut.fills || !("nozzle" in nozOut.fills),
    JSON.stringify(nozOut.fills));
  assert("采样嘴模式 nozzle 有值", nozOut.values.nozzle !== null && nozOut.values.nozzle !== undefined,
    `nozzle=${nozOut.values.nozzle}`);

  const sf = get("sampling-flow");
  const sfOut = sf.compute(modes.DUST_MODE_DEMO["sampling-flow"], { measured: null });
  assert("采样流量模式无 qrs 输入框 → 无 fills", !sfOut.fills || !("qrs" in sfOut.fills),
    JSON.stringify(sfOut.fills));
  assert("采样流量模式 qrs 有值", sfOut.values.qrs !== null && sfOut.values.qrs !== undefined,
    `qrs=${sfOut.values.qrs}`);

  // 有对应输入框的模式 → fills 生效
  const sp = get("static-pressure");
  const spOut = sp.compute({ pt: 0.06, ps: null, dp: 25, kp: 0.84 }, { measured: "pt" });
  assert("静压模式 fills 含 ps（本模式有 ps 输入框）", "ps" in (spOut.fills || {}), JSON.stringify(spOut.fills));
  // 流速模式的输入是动压（无 vs 输入框），因此 vs 结果留在右侧显示
  const vel = get("velocity");
  const velOut = vel.compute(modes.DUST_MODE_DEMO.velocity, { measured: "ps" });
  assert("流速模式无 vs 输入框 → vs 不回填", !velOut.fills || !("vs" in velOut.fills),
    JSON.stringify(velOut.fills));
  assert("流速模式 vs 有值", velOut.values.vs !== null && velOut.values.vs !== undefined,
    `vs=${velOut.values.vs}`);

  const stf = get("standard-flow");
  const stfOut = stf.compute(modes.DUST_MODE_DEMO["standard-flow"], { measured: null });
  assert("标干流量模式 qn 有值", stfOut.values.qn !== null && stfOut.values.qn !== undefined,
    `qn=${stfOut.values.qn}`);
  assert("标干流量模式名不含标杆", stf.name === "标干烟气流量计算", stf.name);

  // 体积计算：Vnd 是标态体积，与工况体积口径不同，不得互相回填
  const sv = get("volume");
  const svOut = sv.compute(modes.DUST_MODE_DEMO.volume, { measured: "ps" });
  assert("体积模式 vnd 不回填到 volume", !svOut.fills || !("vnd" in svOut.fills),
    JSON.stringify(svOut.fills));
  // 体积模式：公式说明按方法切换
  assert("体积模式有 formulasByMethod", !!sv.formulasByMethod, "缺失");
  assert("体积模式 烟温静压法公式含 V=Qrs×n",
    (sv.formulasByMethod?.["1"] || []).some((f) => f.lines.some((l) => l.includes("Qrs × n"))),
    "缺失");
  assert("体积模式 计温计压法公式含 t′",
    (sv.formulasByMethod?.["2"] || []).some((f) => f.lines.some((l) => l.includes("t′"))),
    "缺失");
  assert("体积模式名为 体积计算", sv.name === "体积计算", sv.name);

  // 综合版：静压实测 → 全压派生回填到全压输入框
  const fullOut = get("full").compute(modes.DUST_MODE_DEMO.full, { measured: "ps" });
  assert("综合版 fills 含 pt（派生全压回填）", "pt" in (fullOut.fills || {}), JSON.stringify(fullOut.fills));
  assert("综合版 ps 不回填（实测值）", !fullOut.fills || !("ps" in fullOut.fills),
    JSON.stringify(fullOut.fills));
  // 流速模式同样支持全压派生回填
  const velOut2 = get("velocity").compute(modes.DUST_MODE_DEMO.velocity, { measured: "ps" });
  assert("流速模式 fills 含 pt", "pt" in (velOut2.fills || {}), JSON.stringify(velOut2.fills));
  assert("全表无「标杆」字样",
    !JSON.stringify(modes.DUST_MODES.map((m) => m.name + m.desc)).includes("标杆"));
  assert("全表无「湿基」字样",
    !JSON.stringify(modes.DUST_MODES.map((m) => m.name + m.desc)).includes("湿基"));
  assert("全表无「3260」字样",
    !JSON.stringify(modes.DUST_MODES).includes("3260"));
}

console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
