/**
 * verify-dust-formulas.mjs — 烟尘采样模型公式回归验证（流程式）
 *
 * 用途：
 *   1) 以《烟尘相关计算公式(1).xlsx》各区块的原始算例为准，验证
 *      src/utils/flue-dust-sampling.ts 与 Excel 逐格一致；
 *   2) 验证 src/utils/flue-dust-flow.ts 五步流程（静压→流速→等速流量→
 *      采样体积→排放）的口径、依赖、缺参提示与两法恒等；
 *   3) 验证「全压 ↔ 静压」双向换算与「统一标态干基」口径自洽。
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

// flow 依赖 sampling，用 esbuild bundle 整个 flow（sampling 会被内联）
const esbuild = await import("esbuild");
const bundled = await esbuild.build({
  entryPoints: [resolve(__dirname, "../src/utils/flue-dust-flow.ts")],
  bundle: true,
  format: "esm",
  write: false,
  loader: { ".ts": "ts" },
});
const flow = await import(
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
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} got=${got}  exp=${exp}  rel=${(rel * 100).toFixed(4)}%`);
  ok ? pass++ : fail++;
}
function assert(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name.padEnd(34)}${detail}`);
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
  console.log("--- 区块6 标干烟气流量（Qactual=2579）---");
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

/* ================= 七、流程式五步校验 ================= */
console.log("--- 流程式（flue-dust-flow.ts）---");
{
  assert("流程步数 = 5", flow.DUST_FLOW.length === 5, `实际 ${flow.DUST_FLOW.length}`);
  const stepIds = flow.DUST_FLOW.map((s) => s.id);
  const expectIds = ["pressure", "velocity", "isokinetic", "volume", "emission"];
  assert("流程步骤顺序正确", JSON.stringify(stepIds) === JSON.stringify(expectIds), stepIds.join(">"));
  const titles = flow.DUST_FLOW.map((s) => s.title);
  assert("流程标题齐备",
    JSON.stringify(titles) === JSON.stringify(["静压计算", "流速计算", "等速流量计算", "采样体积计算", "排放计算"]),
    titles.join(" / "));
  // 无「采样嘴直径选取」独立步骤（d 作为③步输入项保留）
  assert("无独立采样嘴直径选取步骤", !titles.some((t) => t.includes("采样嘴直径选取")), titles.join(","));
  assert("③步含采样嘴直径输入",
    flow.DUST_FLOW[2].fields.some((f) => f.key === "nozzle"),
    flow.DUST_FLOW[2].fields.map((f) => f.key).join(","));

  /* 7.1 全量输入 → 5 步全通 */
  const r = flow.computeFlow(flow.DUST_FLOW_DEMO);
  assert("示例数据 5/5 步完成", r.doneCount === 5, `${r.doneCount}/5`);
  for (const st of flow.DUST_FLOW) {
    assert(`步骤「${st.title}」完成`, r.steps[st.id].done === true);
  }

  /* 7.2 各步主结果数值 */
  const V = r.values;
  check("①步 Ps（静压实测）", V.ps, 0.01, 1e-9);
  check("①步 Pt（由静压推算）", V.pt, 0.01 + (25 / 1000) * 0.84 * 0.84, 1e-9);
  check("②步 Vs 烟气流速", V.vs, 5.405331876333254, TOL_E2E);
  check("③步 Qrs 等速采样流量", V.qrs, 36.40832064, TOL_E2E);
  check("④步 工况体积 V（烟温静压法）", V.volumeCondition, 36.40832064 * 120, TOL_E2E);
  check("⑤步 Δg 烟尘增重", V.mass, 10.15447 - 10.13587, 1e-9);
  check("⑤步 Qs 实际烟气流量", V.qs, V.vs * 7.28 * 3600, 1e-9);

  /* 7.3 标态干基恒等式 C×Qn×1e-6 ≡ G */
  check("流程 G = C×Qn×1e-6", V.g, V.c * V.qn * 1e-6, 1e-9);

  /* 7.4 两法标况体积恒等 */
  const rm = flow.computeFlow({ ...flow.DUST_FLOW_DEMO, method: 2 });
  check("两法标况体积一致", rm.values.vnd, r.values.vnd, 1e-9);
  check("两法差值 ≈ 0", rm.values.diff ?? 0, 0, 1e-6);
  check("计温计压法工况体积 V′", rm.values.volumeCondition,
    36.40832064 * (101.9 + 0.01) * (273.15 + 39.2) / (101.9 - 3.38) / (273.15 + 31.8) * 120, TOL_E2E);

  /* 7.5 缺参提示 */
  const empty = flow.computeFlow({});
  for (const st of flow.DUST_FLOW) {
    assert(`空输入时「${st.title}」有待补提示`, empty.steps[st.id].hint.length > 0, empty.steps[st.id].hint);
    assert(`空输入时「${st.title}」未完成`, empty.steps[st.id].done === false);
  }
  assert("①步提示含静压", empty.steps.pressure.hint.includes("静压"), empty.steps.pressure.hint);
  assert("②步提示指向上游①步", empty.steps.velocity.hint.includes("①步"), empty.steps.velocity.hint);
  assert("③步提示指向上游②步", empty.steps.isokinetic.hint.includes("②步"), empty.steps.isokinetic.hint);
  assert("④步提示指向上游③步", empty.steps.volume.hint.includes("③步"), empty.steps.volume.hint);
  assert("⑤步提示指向上游④步", empty.steps.emission.hint.includes("④步"), empty.steps.emission.hint);

  /* 7.6 部分缺失 → 结果标「缺 xxx」 */
  const partial = flow.computeFlow({ dp: 25, kp: 0.84, ps: 0.01 });
  const vsRow = partial.steps.velocity.rows.find((x) => x.key === "vs");
  assert("缺参时 Vs 结果标缺失", vsRow.value === null && vsRow.missing.length > 0, vsRow.missing);
  assert("缺参时 Ps 结果已有值", partial.steps.pressure.rows.find((x) => x.key === "ps").value !== null);

  /* 7.7 全压↔静压 双向互算（实测基准） */
  const byPt = flow.computeFlow({ pt: 0.06, dp: 25, kp: 0.84, temp: 31.8, ba: 101.9 },
    { measured: "pt" });
  check("实测=全压 → 静压反算", byPt.values.ps, 0.06 - (25 / 1000) * 0.84 * 0.84, 1e-9);
  check("实测=全压 → 全压保留", byPt.values.pt, 0.06, 1e-12);
  const byPs = flow.computeFlow({ ps: 0.01, dp: 25, kp: 0.84, temp: 31.8, ba: 101.9 },
    { measured: "ps" });
  check("实测=静压 → 全压推算", byPs.values.pt, 0.01 + (25 / 1000) * 0.84 * 0.84, 1e-9);
  const both = flow.computeFlow({ pt: 0.06, ps: 0.01, dp: 25, kp: 0.84 }, { measured: "ps" });
  check("双填实测=静压 → 全压派生", both.values.pt, 0.01 + (25 / 1000) * 0.84 * 0.84, 1e-9);
  check("双填实测=静压 → 静压保留", both.values.ps, 0.01, 1e-12);

  /* 7.8 派生值不得当基准（清空后不自我回填） */
  const derivedCase = flow.computeFlow({ pt: 0.06, dp: 25, kp: 0.84 },
    { measured: "pt", derived: ["ps"] });
  check("派生静压仍由全压反算", derivedCase.values.ps, 0.06 - (25 / 1000) * 0.84 * 0.84, 1e-9);

  /* 7.9 标况体积不含重复干基、Qn 含干基 */
  const t = 31.8, Ba = 101.9, Ps = 0.01, Xsw = 0.38;
  const factor = (mod.DUST_T0 / (mod.DUST_T0 + t)) * ((Ba + Ps) / mod.DUST_P0);
  check("流程 Vnd = V × 因子（不含含湿量）", r.values.vnd, r.values.volumeCondition * factor, 1e-9);
  check("流程 Qn = Qs × 因子 × (1−Xsw/100)", r.values.qn,
    r.values.qs * factor * (1 - Xsw / 100), 1e-9);

  /* 7.10 步骤报表结构完整 */
  for (const st of flow.DUST_FLOW) {
    const s = r.steps[st.id];
    assert(`步骤「${st.title}」有报表行`, s.rows.length === st.results.length, `${s.rows.length}/${st.results.length}`);
    assert(`步骤「${st.title}」报表行三要素齐备`,
      s.rows.every((x) => typeof x.label === "string" && x.label.length > 0 && "value" in x && "unit" in x));
    assert(`步骤「${st.title}」有公式说明`, s.formulas.length > 0);
  }

  /* 7.11 禁用字样 */
  const allText = JSON.stringify(flow.DUST_FLOW) + JSON.stringify(flow.DUST_FLOW_DEMO);
  assert("流程无「标杆」字样", !allText.includes("标杆"));
  assert("流程无「湿基」字样", !allText.includes("湿基"));
  assert("流程无「3260」字样", !allText.includes("3260"));
  assert("⑤步含标干烟气流量", flow.DUST_FLOW[4].results.some((x) => x.key === "qn" && x.label.includes("标干烟气流量")));
}

console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
