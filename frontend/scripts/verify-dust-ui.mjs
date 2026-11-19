/**
 * verify-dust-ui.mjs — 烟尘采样工具页线上 UI 验证（无头 Chrome）
 *
 * 验证要点：
 *   1) 工具详情页无「标题下标准特指提示」副标题
 *   2) 模式选择器：9 个模式按钮，可切换，切换后表单独立（互不串值）
 *   3) 无预填：所有输入框为空；结果标注「缺 xxx」
 *   4) 填入示例 → 自动计算，数值与引擎一致
 *   5) 全压/静压双向换算（线上实测）
 *   6) 干湿基切换：干基浓度 = 湿基 ÷ (1−Xsw/100)，排放速率不变
 *   7) 移动端 H5 视口无横向溢出
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
await sleep(1800);

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
ok(modeNames.length === 9, `模式按钮 9 个（实际 ${modeNames.length}）：${modeNames.join(" / ")}`);
const expectModes = [
  "烟气静压计算", "采样嘴直径选取", "烟气流速计算", "采样流量计算",
  "工况体积计算", "标况采样体积计算", "实际烟气流量计算", "标杆烟气流量计算", "综合版（全链路）",
];
ok(
  expectModes.every((n) => modeNames.includes(n)),
  "9 个模式名称齐备：" + expectModes.filter((n) => !modeNames.includes(n)).join(",")
);
const refs = await page.$$eval(".mode .mode-r", (els) => els.map((e) => e.textContent.trim()));
ok(refs.every((r) => r && !/3260/.test(r)), "模式标签无 3260 字样：" + refs.join(","));

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
await sleep(1200);

const readResults = () =>
  page.$$eval(".res", (els) =>
    els.map((e) => ({
      label: e.querySelector(".r-l")?.textContent.trim(),
      value: e.querySelector(".r-v b")?.textContent.trim(),
      unit: e.querySelector(".r-u")?.textContent.trim() || "",
      miss: e.querySelector(".r-miss")?.textContent.trim() || "",
    }))
  );

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
const qnRes = get("标杆烟气流量 Qn");
ok(qnRes && qnRes.value !== "—", `标杆烟气流量 Qn = ${qnRes?.value} ${qnRes?.unit}`);

/* ---------- 5. 干湿基切换（综合版） ---------- */
const cWet = parseFloat(cRes.value);
const qnWet = parseFloat(qnRes.value.replace(/,/g, ""));
const gWet = parseFloat(gRes.value);

await page.evaluate(() => {
  const b = [...document.querySelectorAll(".bbtn")].find((x) => x.textContent.trim() === "干基");
  if (b) b.click();
});
await sleep(900);
resMap = await readResults();
const cDry = parseFloat(get("颗粒物浓度 C").value);
const qnDry = parseFloat(get("标杆烟气流量 Qn").value.replace(/,/g, ""));
const gDry = parseFloat(get("颗粒物排放速率 G").value);

const xsw = 7.89;
const df = 1 - xsw / 100;
ok(Math.abs(cDry - cWet / df) / (cWet / df) < 2e-3, `干基浓度 = 湿基 ÷ (1−Xsw/100)（${cWet} → ${cDry}）`);
ok(Math.abs(qnDry - qnWet * df) / (qnWet * df) < 2e-3, `干基标杆流量 = 湿基 × (1−Xsw/100)（${qnWet} → ${qnDry}）`);
ok(Math.abs(gDry - gWet) / gWet < 2e-3, `排放速率口径切换后不变（${gWet} → ${gDry}）`);
ok(Math.abs(cDry * qnDry * 1e-6 - gDry) / gDry < 2e-3, "干基下 C × Qn × 10⁻⁶ ≡ G");

// 切回湿基
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".bbtn")].find((x) => x.textContent.trim() === "湿基");
  if (b) b.click();
});
await sleep(700);

/* ---------- 6. 切换到「烟气静压计算」：全压 → 静压 ---------- */
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

await clickBtn("示例");
await sleep(900);
resMap = await readResults();
const psRes = get("烟气静压 Ps");
const ptRes = get("烟气全压 Pt");
ok(psRes && psRes.value !== "—", `静压 Ps = ${psRes?.value} ${psRes?.unit}`);
ok(ptRes && ptRes.value !== "—", `全压 Pt = ${ptRes?.value} ${ptRes?.unit}`);
// 示例：Pt=0.06, Δp=25, Kp=0.84 → Ps = 0.06 - 0.01764 = 0.04236
const expectPs = 0.06 - (25 / 1000) * 0.84 * 0.84;
ok(psRes && Math.abs(parseFloat(psRes.value) - expectPs) < 1e-4, `全压反算静压 = ${expectPs.toFixed(4)}（实际 ${psRes?.value}）`);

/* ---------- 7. 静压 → 全压 互算（手动改输入） ---------- */
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  // 字段顺序：全压、静压、动压、皮托管系数
  setter.call(inputs[0], "");
  inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
  setter.call(inputs[1], "0.01");
  inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(900);
resMap = await readResults();
const ptCalc = get("烟气全压 Pt");
const expectPt = 0.01 + (25 / 1000) * 0.84 * 0.84;
ok(ptCalc && Math.abs(parseFloat(ptCalc.value) - expectPt) < 1e-4, `静压推算全压 = ${expectPt.toFixed(4)}（实际 ${ptCalc?.value}）`);

/* ---------- 8. 表单独立性：切走再切回，数据仍在 ---------- */
await switchMode("烟气流速计算");
await sleep(500);
await switchMode("烟气静压计算");
await sleep(600);
const keptPs = await page.$$eval(".inp", (els) => els[1]?.value);
ok(keptPs === "0.01", `模式切换后各自表单数据保留（静压 ${keptPs}）`);

/* ---------- 9. 各分项模式都能算出主结果 ---------- */
const modeChecks = [
  ["采样嘴直径选取", "采样嘴直径 D"],
  ["烟气流速计算", "烟气流速 Vs"],
  ["采样流量计算", "等速采样流量 Qrs"],
  ["工况体积计算", "工况体积（烟温静压法）"],
  ["标况采样体积计算", "标况采样体积 Vnd"],
  ["实际烟气流量计算", "实际烟气流量 Qs"],
  ["标杆烟气流量计算", "标杆烟气流量 Qn"],
  ["综合版（全链路）", "颗粒物浓度 C"],
];
for (const [modeName, resLabel] of modeChecks) {
  await switchMode(modeName);
  await sleep(500);
  await clickBtn("示例");
  await sleep(900);
  const map = await readResults();
  const r = map.find((x) => x.label === resLabel);
  ok(r && r.value && r.value !== "—", `${modeName} → ${resLabel} = ${r?.value} ${r?.unit}`);
}

/* ---------- 10. 清空 ---------- */
await switchMode("综合版（全链路）");
await sleep(500);
await clickBtn("清空");
await sleep(800);
const afterClear = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").length);
ok(afterClear === 0, `清空后无残留值（残留 ${afterClear}）`);

/* ---------- 11. 负数输入支持 ---------- */
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  // 综合版字段顺序：动压、静压、全压、烟温…
  setter.call(inputs[1], "-0.04");
  inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(700);
const psVal = await page.$$eval(".inp", (els) => els[1].value);
ok(psVal === "-0.04", `负压输入保留负号（${psVal}）`);

/* ---------- 12. 移动端 H5 视口 ---------- */
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await sleep(1000);
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
await sleep(600);
await clickBtn("示例");
await sleep(1000);
await page.screenshot({ path: "D:/tmp/dust-desktop.png", fullPage: false });

await browser.close();
console.log(`\n结果：FAIL ${fail.length} 项`);
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
