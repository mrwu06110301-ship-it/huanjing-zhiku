/**
 * verify-dust-ui.mjs — 烟尘采样工具页线上 UI 验证（无头 Chrome）
 *
 * 验证要点：
 *   1) 工具详情页无「标题下标准特指提示」副标题
 *   2) 模式选择器：9 个模式按钮，可切换，切换后表单独立（互不串值）
 *   3) 无预填：所有输入框为空；结果标注「缺 xxx」
 *   4) 填入示例 → 自动计算，数值与引擎一致
 *   5) 全压/静压双向换算（输入框即显示，结果回填到输入框）
 *   6) 统一标态干基：C × Qn × 10⁻⁶ ≡ G
 *   7) 公式与口径说明随当前模式同步
 *   8) 无「标杆」「湿基」字样
 *   9) 移动端 H5 视口无横向溢出
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "https://yigan.tech/tools/pollution-source-model";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2000);

const fail = [];
const ok = (cond, msg) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fail.push(msg);
};

/* ---------- 1. 页头副标题应隐藏 ---------- */
const subText = await page.$eval(".page-header-sub", (el) => el.textContent.trim()).catch(() => null);
ok(subText === null, "工具详情页无「标题下标准提示」副标题（当前：" + JSON.stringify(subText) + "）");

/* ---------- 2. 模式选择器 ---------- */
const modeNames = await page.$$eval(".mode .mode-n", (els) => els.map((e) => e.textContent.trim()));
ok(modeNames.length === 8, `模式按钮 8 个（实际 ${modeNames.length}）：${modeNames.join(" / ")}`);
const expectModes = [
  "烟气静压计算", "采样嘴直径选取", "烟气流速计算", "采样流量计算",
  "体积计算", "实际烟气流量计算", "标干烟气流量计算", "综合版（全链路）",
];
ok(
  expectModes.every((n) => modeNames.includes(n)),
  "8 个模式名称齐备：" + expectModes.filter((n) => !modeNames.includes(n)).join(",")
);
ok(!modeNames.some((n) => n.includes("标杆")), "无「标杆烟气流量」模式名");
ok(!modeNames.some((n) => n.includes("工况体积计算") || n.includes("标况采样体积计算")),
  "工况体积/标况体积已合并为「体积计算」");
const bodyText = await page.evaluate(() => document.body.innerText);
ok(!bodyText.includes("标杆"), "页面无「标杆」字样");
ok(!bodyText.includes("湿基"), "页面无「湿基」字样");
ok(!bodyText.includes("3260"), "页面无 3260 字样");

/* ---------- 3. 默认综合版：无预填 + 空态标注 ---------- */
const activeName = await page.$eval(".mode.active .mode-n", (el) => el.textContent.trim());
ok(activeName.includes("综合版"), "默认进入综合版：" + activeName);

const preFilled = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").map((e) => e.value));
ok(preFilled.length === 0, `输入框无预填值（实际预填：${JSON.stringify(preFilled)}）`);

let emptyMiss = await page.$$eval(".res.empty .r-miss", (els) => els.length);
ok(emptyMiss >= 12, `空态下结果均标注缺失项（${emptyMiss} 项带「缺」）`);

/* ---------- 4. 填入示例 → 自动计算 ---------- */
const clickBtn = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll(".ghost")].find((x) => x.textContent.includes(t));
    if (b) b.click();
    return !!b;
  }, text);

await clickBtn("示例");
await sleep(1500);

const readResults = () =>
  page.$$eval(".res", (els) =>
    els.map((e) => ({
      label: e.querySelector(".r-l")?.textContent.trim(),
      value: e.querySelector(".r-v b")?.textContent.trim(),
      unit: e.querySelector(".r-u")?.textContent.trim() || "",
      miss: e.querySelector(".r-miss")?.textContent.trim() || "",
    }))
  );

const readInputs = () => page.$$eval(".inp", (els) => els.map((e) => e.value));

let resMap = await readResults();
const get = (lbl) => resMap.find((r) => r.label === lbl);
ok(resMap.filter((r) => !r.miss).length >= 12, `示例后 ${resMap.filter((r) => !r.miss).length} 项已算出`);

const cRes = get("颗粒物浓度 C");
ok(cRes && cRes.value !== "—", `颗粒物浓度 C = ${cRes?.value} ${cRes?.unit}`);
const cadjRes = get("折算浓度 Cα");
ok(cadjRes && cadjRes.value !== "—", `折算浓度 Cα = ${cadjRes?.value} ${cadjRes?.unit}`);
const gRes = get("颗粒物排放速率 G");
ok(gRes && gRes.value !== "—", `排放速率 G = ${gRes?.value} ${gRes?.unit}`);
const vsRes = get("烟气流速 Vs");
ok(vsRes && vsRes.value !== "—", `烟气流速 Vs = ${vsRes?.value} ${vsRes?.unit}`);
const qnRes = get("标干烟气流量 Qn");
ok(qnRes && qnRes.value !== "—", `标干烟气流量 Qn = ${qnRes?.value} ${qnRes?.unit}`);

/* ---------- 5. 标态干基恒等式 ---------- */
const cV = parseFloat(cRes.value);
const qnV = parseFloat(qnRes.value.replace(/,/g, ""));
const gV = parseFloat(gRes.value);
ok(Math.abs(cV * qnV * 1e-6 - gV) / gV < 2e-3, `标干口径 C × Qn × 10⁻⁶ ≡ G（${cV} × ${qnV} × 1e-6 = ${(cV * qnV * 1e-6).toFixed(6)} vs ${gV}）`);

/* ---------- 6. 公式面板随模式同步 ---------- */
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".doc-h")][0];
  if (b) b.click();
});
await sleep(600);
const fxTitles = await page.$$eval(".fx-t", (els) => els.map((e) => e.textContent.trim()));
ok(fxTitles.length > 0, `公式面板展开且有内容：${fxTitles.join(" / ")}`);
const fxLines = await page.$$eval(".fx-l", (els) => els.map((e) => e.textContent.trim()));
ok(fxLines.some((t) => t.includes("标干烟气流量")), "综合版公式含「标干烟气流量」");
ok(fxLines.some((t) => t.includes("Q = C") || t.includes("G = C")), "综合版公式含排放速率 G = C × Qn × 10⁻⁶");
ok(!fxLines.some((t) => t.includes("湿基") || t.includes("标杆")), "公式行无「湿基」「标杆」字样");

/* ---------- 7. 切换到「烟气静压计算」：全压 → 静压（输入框即显示） ---------- */
const switchMode = (name) =>
  page.evaluate((n) => {
    const b = [...document.querySelectorAll(".mode")].find((x) => x.querySelector(".mode-n")?.textContent.trim() === n);
    if (b) b.click();
    return !!b;
  }, name);

await switchMode("烟气静压计算");
await sleep(700);
const spTitle = await page.$eval(".bar-t b", (el) => el.textContent.trim());
ok(spTitle.includes("烟气静压"), "已切换到「烟气静压计算」：" + spTitle);

const fxTitlesSp = await page.$$eval(".fx-t", (els) => els.map((e) => e.textContent.trim()));
ok(fxTitlesSp.some((t) => t.includes("压力换算")), "公式面板随模式切换为「压力换算」：" + fxTitlesSp.join(","));

await clickBtn("示例");
await sleep(1200);
let inputs = await readInputs();
// 字段顺序：全压、静压、动压、皮托管系数
const expectPs = 0.06 - (25 / 1000) * 0.84 * 0.84;
ok(Math.abs(parseFloat(inputs[1]) - expectPs) < 1e-3, `填全压 → 静压回填输入框（期望 ${expectPs.toFixed(4)}，实际 ${inputs[1]}）`);
const calcTags = await page.$$eval(".calc-tag", (els) => els.map((e) => e.textContent.trim()));
ok(calcTags.length > 0, `派生输入框标「计算值」（${calcTags.length} 处）`);

resMap = await readResults();
const psRes = get("烟气静压 Ps");
ok(!psRes, "已回填的静压不在右侧重复列出");
const dpRes = get("动压折算压增量");
ok(dpRes && dpRes.value !== "—", `动压折算压增量 = ${dpRes?.value} ${dpRes?.unit}`);

/* ---------- 8. 静压 → 全压 互算（手动改输入） ---------- */
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inputs[0], "");
  inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
  setter.call(inputs[1], "0.01");
  inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(1000);
inputs = await readInputs();
const expectPt = 0.01 + (25 / 1000) * 0.84 * 0.84;
ok(Math.abs(parseFloat(inputs[0]) - expectPt) < 1e-3, `填静压 → 全压回填输入框（期望 ${expectPt.toFixed(4)}，实际 ${inputs[0]}）`);

/* ---------- 9. 表单独立性：切走再切回，数据仍在 ---------- */
await switchMode("烟气流速计算");
await sleep(500);
await switchMode("烟气静压计算");
await sleep(700);
const keptPs = (await readInputs())[1];
ok(keptPs === "0.01", `模式切换后各自表单数据保留（静压 ${keptPs}）`);

/* ---------- 10. 各分项模式都能算出主结果 ---------- */
const modeChecks = [
  ["采样嘴直径选取", "采样嘴直径 D"],
  ["烟气流速计算", "烟气流速 Vs"],
  ["采样流量计算", "等速采样流量 Qrs"],
  ["体积计算", "标况体积 Vnd"],
  ["实际烟气流量计算", "实际烟气流量 Qs"],
  ["标干烟气流量计算", "标干烟气流量 Qn"],
  ["综合版（全链路）", "颗粒物浓度 C"],
];
for (const [modeName, resLabel] of modeChecks) {
  await switchMode(modeName);
  await sleep(500);
  await clickBtn("示例");
  await sleep(1000);
  const map = await readResults();
  const r = map.find((x) => x.label === resLabel);
  ok(r && r.value && r.value !== "—", `${modeName} → ${resLabel} = ${r?.value} ${r?.unit}`);
}

/* ---------- 10b. 体积计算：方法下拉 + 公式随方法切换 ---------- */
await switchMode("体积计算");
await sleep(600);
const selCount = await page.$$eval(".in .wrap select.sel", (els) => els.length);
ok(selCount >= 1, `体积计算有方法下拉（${selCount} 个）`);
const methodLabels = await page.$$eval(".in .wrap select.sel option", (els) => els.map((e) => e.textContent.trim()));
ok(methodLabels.some((t) => t.includes("烟温静压法")) && methodLabels.some((t) => t.includes("计温计压法")),
  "方法下拉含两法：" + methodLabels.join(" / "));

await clickBtn("示例");
await sleep(900);
const fxFlow = await page.evaluate(() => {
  const t = [...document.querySelectorAll(".doc-b .fx-l")].map((e) => e.textContent.trim()).join(" | ");
  return t;
});
ok(fxFlow.includes("Qrs × n"), "烟温静压法公式含 V = Qrs × n：" + fxFlow.slice(0, 160));

// 切换到计温计压法
await page.evaluate(() => {
  const sel = document.querySelector(".in .wrap select.sel");
  if (!sel) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, "2");
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(900);
const fxMeter = await page.evaluate(() => {
  const t = [...document.querySelectorAll(".doc-b .fx-l")].map((e) => e.textContent.trim()).join(" | ");
  return t;
});
ok(fxMeter.includes("t′"), "计温计压法公式含 t′：" + fxMeter.slice(0, 160));
ok(fxFlow !== fxMeter, "两法公式确实不同");

/* ---------- 11. 清空 ---------- */
await switchMode("综合版（全链路）");
await sleep(500);
await clickBtn("清空");
await sleep(900);
const afterClear = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").length);
ok(afterClear === 0, `清空后无残留值（残留 ${afterClear}）`);

/* ---------- 12. 负数输入支持 ---------- */
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  // 综合版字段顺序：动压、静压、全压、烟温…
  setter.call(inputs[1], "-0.04");
  inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(800);
const psVal = (await readInputs())[1];
ok(psVal === "-0.04", `负压输入保留负号（${psVal}）`);

/* ---------- 13. 移动端 H5 视口 ---------- */
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await sleep(1200);
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
}));
ok(overflow.docW <= overflow.winW + 2, `移动端无横向溢出（doc=${overflow.docW} win=${overflow.winW}）`);

const modeGridCols = await page.evaluate(() => {
  const g = document.querySelector(".mode-grid");
  return g ? getComputedStyle(g).gridTemplateColumns : "";
});
ok(!!modeGridCols, `移动端模式网格正常：${modeGridCols}`);

await page.screenshot({ path: "D:/tmp/dust-mobile.png", fullPage: false });
await page.setViewport({ width: 1440, height: 1000 });
await sleep(700);
await clickBtn("示例");
await sleep(1200);
await page.screenshot({ path: "D:/tmp/dust-desktop.png", fullPage: false });

await browser.close();
console.log(`\n结果：FAIL ${fail.length} 项`);
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
