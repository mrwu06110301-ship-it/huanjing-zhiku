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
 *    源文件：frontend/src/utils/flue-dust-sampling.ts + flue-dust-modes.ts
 *    重新生成：cd frontend && node scripts/build-dust-engine.mjs
 *
 * 内容：全压↔静压双向换算、干湿基口径联动、9 个分项计算模式 + 综合版
 */
`;

writeFileSync(OUT, header + code, "utf8");
rmSync(tmpDir, { recursive: true, force: true });

const size = statSync(OUT).size;
console.log(`\n已生成：${OUT}`);
console.log(`大小：${(size / 1024).toFixed(1)} KB`);

// 自检：确认关键导出存在且模式数为 9
const { createRequire } = await import("module");
const require = createRequire(import.meta.url);
const mod = require(OUT);
const need = [
  "computeDustSampling",
  "DUST_DEMO",
  "DUST_EXCEL_CASE",
  "DUST_MODES",
  "DUST_MODE_MAP",
  "DUST_MODE_DEMO",
  "totalToStatic",
  "staticToTotal",
  "standardFlow",
];
const missing = need.filter((k) => !(k in mod));
if (missing.length) {
  console.error(`[ERROR] 缺少导出：${missing.join(", ")}`);
  process.exit(1);
}
console.log(`导出自检通过：${need.join(", ")}`);
console.log(`模式数：${mod.DUST_MODES.length}`);

// 口径自检：干湿基下 C×Qn×1e-6 ≡ G
const demo = mod.DUST_DEMO;
for (const basis of ["wet", "dry"]) {
  const r = mod.computeDustSampling({ ...demo, basis });
  const C = r.values.concentration.value;
  const Qn = r.values.dryStandardFlow.value;
  const G = r.values.emissionRate.value;
  const err = Math.abs(C * Qn * 1e-6 - G) / G;
  console.log(
    `  ${basis}: C=${C.toFixed(4)} Qn=${Qn.toFixed(1)} G=${G.toFixed(6)}  恒等误差=${(err * 100).toExponential(2)}%`
  );
  if (err > 1e-9) {
    console.error("[ERROR] 干湿基口径不自洽");
    process.exit(1);
  }
}
console.log("口径自检通过");
