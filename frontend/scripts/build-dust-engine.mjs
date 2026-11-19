/**
 * build-dust-engine.mjs — 烟尘计算引擎跨端同步构建
 *
 * 目的：平台端（Vue/TS）与小程序端（原生 JS）共用同一套计算逻辑，
 *      避免两侧手工同步导致口径漂移。
 *
 * 做法：用 esbuild 把 src/utils/dust-engine-entry.ts（统一出口）
 *      打包为 CommonJS 单文件，输出到小程序目录：
 *      D:/软件开发/miniprogram-product-xiaowu/utils/dust-engine.js
 *
 * 运行：cd frontend && node scripts/build-dust-engine.mjs
 */
import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

// 小程序目录可用环境变量覆盖
const MP_ROOT = process.env.MP_ROOT || "D:/软件开发/miniprogram-product-xiaowu";
const OUT = resolve(MP_ROOT, "utils/dust-engine.js");

if (!existsSync(MP_ROOT)) {
  console.error(`[ERROR] 小程序目录不存在：${MP_ROOT}`);
  console.error("可用环境变量 MP_ROOT 指定实际路径。");
  process.exit(1);
}
mkdirSync(resolve(MP_ROOT, "utils"), { recursive: true });

const tmpDir = resolve(frontendRoot, ".dust-build");
await build({
  entryPoints: [resolve(frontendRoot, "src/utils/dust-engine-entry.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  target: ["es2018"],
  outfile: resolve(tmpDir, "dust-engine.js"),
  write: true,
  logLevel: "info",
});

let code = readFileSync(resolve(tmpDir, "dust-engine.js"), "utf8");

// 去掉 esbuild 的 sourcemap 注释与 license 噪音
code = code.replace(/\/\/# sourceMappingURL=.*$/gm, "");

const header = `/**
 * dust-engine.js — 烟尘采样计算引擎（小程序端）
 *
 * ⚠️ 本文件由 frontend/scripts/build-dust-engine.mjs 自动生成，请勿手工修改。
 *    源文件：frontend/src/utils/flue-dust-sampling.ts + flue-dust-flow.ts
 *    重新生成：cd frontend && node scripts/build-dust-engine.mjs
 *
 * 内容：全压↔静压双向换算、标态干基口径、五步流程式计算
 */
`;

writeFileSync(OUT, header + code, "utf8");
rmSync(tmpDir, { recursive: true, force: true });

const size = statSync(OUT).size;
console.log(`\n已生成：${OUT}`);
console.log(`大小：${(size / 1024).toFixed(1)} KB`);

// 自检：确认关键导出存在
const { createRequire } = await import("module");
const require = createRequire(import.meta.url);
const mod = require(OUT);
const need = [
  "computeDustSampling",
  "DUST_DEMO",
  "DUST_EXCEL_CASE",
  "totalToStatic",
  "staticToTotal",
  "standardFlow",
  "DUST_FLOW",
  "DUST_FLOW_DEMO",
  "computeFlow",
];
const missing = need.filter((k) => !(k in mod));
if (missing.length) {
  console.error(`[ERROR] 缺少导出：${missing.join(", ")}`);
  process.exit(1);
}
console.log(`导出自检通过：${need.join(", ")}`);
console.log(`流程步数：${mod.DUST_FLOW.length}`);

// 流程式自检：五步全通 + 两法标况体积恒等
{
  const r = mod.computeFlow(mod.DUST_FLOW_DEMO);
  console.log(`  流程完成步数：${r.doneCount}/${r.totalCount}`);
  if (r.doneCount !== r.totalCount) {
    console.error("[ERROR] 流程式计算未全部完成");
    process.exit(1);
  }
  const r2 = mod.computeFlow({ ...mod.DUST_FLOW_DEMO, method: 2 });
  const d = Math.abs(r.values.vnd - r2.values.vnd);
  console.log(`  两法标况体积差：${d.toExponential(3)} L`);
  if (d > 1e-6) {
    console.error("[ERROR] 两法标况体积不恒等");
    process.exit(1);
  }
}

// 口径自检：标态干基下 C×Qn×1e-6 ≡ G
{
  const r = mod.computeDustSampling(mod.DUST_DEMO);
  const C = r.values.concentration.value;
  const Qn = r.values.dryStandardFlow.value;
  const G = r.values.emissionRate.value;
  const err = Math.abs(C * Qn * 1e-6 - G) / G;
  console.log(
    `  标态干基: C=${C.toFixed(4)} Qn=${Qn.toFixed(1)} G=${G.toFixed(6)}  恒等误差=${(err * 100).toExponential(2)}%`
  );
  if (err > 1e-9) {
    console.error("[ERROR] 标态干基口径不自洽");
    process.exit(1);
  }
  if ("basis" in mod.DUST_DEMO) {
    console.error("[ERROR] DUST_DEMO 仍含 basis 字段（口径开关应已移除）");
    process.exit(1);
  }
}
console.log("口径自检通过（统一标态干基，无口径开关）");
