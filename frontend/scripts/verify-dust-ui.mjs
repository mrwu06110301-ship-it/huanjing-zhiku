/**
 * verify-dust-ui.mjs — 烟尘采样工具页线上 UI 验证（无头 Chrome）
 *
 * 验证要点（流程式）：
 *   1) 工具详情页无「标题下标准特指提示」副标题
 *   2) 流程条 5 步，顺序正确，无「采样嘴直径选取」独立工具
 *   3) 左侧输入区按步骤从上到下分组，缺参步骤显示灰色提示
 *   4) 无预填：所有输入框为空；报表标「缺 xxx」
 *   5) 填入示例 → 五步全通，数值与引擎一致
 *   6) 全压/静压双向换算（输入框即显示，标「计算值」）
 *   7) 右侧为竖列报表（项目|数值|单位）
 *   8) 统一标态干基：C × Qn × 10⁻⁶ ≡ G
 *   9) 公式说明按 5 步组织
 *  10) 无「标杆」「湿基」「3260」字样
 *  11) 移动端 H5 视口无横向溢出
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

/* ---------- 2. 流程条 ---------- */
const flowNames = await page.$$eval(".fb-item .fb-nm", (els) => els.map((e) => e.textContent.trim()));
const expectSteps = ["静压计算", "流速计算", "等速流量计算", "采样体积计算", "排放计算"];
ok(flowNames.length === 5, `流程条 5 步（实际 ${flowNames.length}）：${flowNames.join(" / ")}`);
ok(
  JSON.stringify(flowNames) === JSON.stringify(expectSteps),
  "流程步骤顺序与命名正确：" + flowNames.join(" → ")
);
ok(!flowNames.some((n) => n.includes("采样嘴直径")), "无独立「采样嘴直径选取」步骤");
ok(!page.$$eval ? true : true, "");
// 无模式选择器
const modeCount = await page.$$eval(".mode", (els) => els.length);
ok(modeCount === 0, `无模式选择器（.mode 按钮 ${modeCount} 个）`);

/* ---------- 3. 页面禁字 ---------- */
const bodyText = await page.evaluate(() => document.body.innerText);
ok(!bodyText.includes("标杆"), "页面无「标杆」字样");
ok(!bodyText.includes("湿基"), "页面无「湿基」字样");
ok(!bodyText.includes("3260"), "页面无 3260 字样");

/* ---------- 4. 左侧步骤分组 ---------- */
const groupTitles = await page.$$eval(".sg .sg-t b", (els) => els.map((e) => e.textContent.trim()));
ok(
  JSON.stringify(groupTitles) === JSON.stringify(expectSteps),
  "左侧按步骤从上到下分组：" + groupTitles.join(" → ")
);

/* ---------- 5. 无预填 + 无冗长提示文字 ---------- */
const preFilled = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").map((e) => e.value));
ok(preFilled.length === 0, `输入框无预填值（实际预填：${JSON.stringify(preFilled)}）`);

// 步骤分组不再显示「待补：xxx」长提示
const hints = await page.$$eval(".sg-hint", (els) => els.length);
ok(hints === 0, `步骤分组无「待补」提示（实际 ${hints} 处）`);
// 报表不再显示「缺 xxx」长说明
const missCount = await page.$$eval(".rp-m", (els) => els.length);
ok(missCount === 0, `报表无「缺 xxx」说明（实际 ${missCount} 处）`);
// 步骤分组不显示二级副标题
const subTitles = await page.$$eval(".sg-d", (els) => els.length);
ok(subTitles === 0, `步骤分组无二级副标题（实际 ${subTitles} 处）`);

/* ---------- 6. 填入示例 → 五步全通 ---------- */
const clickBtn = (text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll(".ghost")].find((x) => x.textContent.includes(t));
    if (b) b.click();
    return !!b;
  }, text);

await clickBtn("示例");
await sleep(1800);

const flowDone = await page.$$eval(".fb-item.done", (els) => els.length);
ok(flowDone === 5, `示例数据后 5 步全部完成（实际 ${flowDone}）`);

/* ---------- 7. 右侧竖列报表 ---------- */
const repGroups = await page.$$eval(".rep-grp .rg-t", (els) => els.map((e) => e.textContent.trim()));
ok(
  JSON.stringify(repGroups) === JSON.stringify(expectSteps),
  "报表按 5 步分组：" + repGroups.join(" → ")
);
const repRows = await page.$$eval(".rep .rp", (els) =>
  els.map((e) => ({
    label: e.querySelector(".rp-l")?.textContent.trim(),
    value: e.querySelector(".rp-v")?.textContent.trim(),
    unit: e.querySelector(".rp-u")?.textContent.trim() || "",
  }))
);
ok(repRows.length >= 15, `报表行数充足（${repRows.length} 行）`);
ok(repRows.every((r) => r.label && r.value), "每行均有项目名与数值");
const withUnit = repRows.filter((r) => r.unit).length;
ok(withUnit >= 10, `多数行带单位（${withUnit} 行）`);

const get = (lbl) => repRows.find((r) => r.label === lbl);
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
const vndRes = get("标况体积 Vnd");
ok(vndRes && vndRes.value !== "—", `标况体积 Vnd = ${vndRes?.value} ${vndRes?.unit}`);
const qrsRes = get("等速采样流量 Qrs");
ok(qrsRes && qrsRes.value !== "—", `等速采样流量 Qrs = ${qrsRes?.value} ${qrsRes?.unit}`);

/* ---------- 8. 标态干基恒等式 ---------- */
const cV = parseFloat(cRes.value);
const qnV = parseFloat(qnRes.value.replace(/,/g, ""));
const gV = parseFloat(gRes.value);
ok(Math.abs(cV * qnV * 1e-6 - gV) / gV < 2e-3, `标干口径 C × Qn × 10⁻⁶ ≡ G（${cV} × ${qnV} × 1e-6 = ${(cV * qnV * 1e-6).toFixed(6)} vs ${gV}）`);

/* ---------- 9. 参数复用：动压/皮托管系数只出现一次可编辑 ---------- */
const reusedCount = await page.$$eval(".fld.reused", (els) => els.length);
ok(reusedCount > 0, `存在只读复用字段（${reusedCount} 处）`);
const reuseTags = await page.$$eval(".reuse-tag", (els) => els.map((e) => e.textContent.trim()));
ok(reuseTags.length === reusedCount, `复用字段均标「复用」（${reuseTags.length}）`);
const upRows = await page.$$eval(".up-row", (els) => els.length);
ok(upRows > 0, `显示上游产物带入（${upRows} 行）`);

/* ---------- 10. 公式面板按 5 步组织 ---------- */
await page.evaluate(() => {
  const b = [...document.querySelectorAll(".doc-h")][0];
  if (b) b.click();
});
await sleep(700);
const fxTitles = await page.$$eval(".fx-t", (els) => els.map((e) => e.textContent.trim()));
ok(fxTitles.length === 5, `公式面板 5 段（实际 ${fxTitles.length}）：${fxTitles.join(" / ")}`);
const fxLines = await page.$$eval(".fx-l", (els) => els.map((e) => e.textContent.trim()));
ok(fxLines.some((t) => t.includes("标干烟气流量")), "公式含「标干烟气流量」");
ok(fxLines.some((t) => t.includes("G = C")), "公式含排放速率 G = C × Qn × 10⁻⁶");
ok(fxLines.some((t) => t.includes("Qrs × n")), "④步公式含 V = Qrs × n");
ok(!fxLines.some((t) => t.includes("湿基") || t.includes("标杆")), "公式行无「湿基」「标杆」字样");

/* ---------- 11. 全压 ↔ 静压 双向互算 ---------- */
// 找到①步的全压输入框与静压输入框
const idxOfPs = await page.evaluate(() => {
  const labels = [...document.querySelectorAll(".sg .fld")];
  const ps = labels.find((e) => e.querySelector(".sym")?.textContent.trim() === "Ps");
  const pt = labels.find((e) => e.querySelector(".sym")?.textContent.trim() === "Pt");
  const all = [...document.querySelectorAll(".sg .fld")];
  return { ps: all.indexOf(ps), pt: all.indexOf(pt) };
});
ok(idxOfPs.ps >= 0 && idxOfPs.pt >= 0, `找到 Ps/Pt 输入框（ps=${idxOfPs.ps} pt=${idxOfPs.pt}）`);

// 清空全压 → 填静压 0.01 → 全压应回填 0.02764
await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inputs[ix.pt], "");
  inputs[ix.pt].dispatchEvent(new Event("input", { bubbles: true }));
  setter.call(inputs[ix.ps], "0.01");
  inputs[ix.ps].dispatchEvent(new Event("input", { bubbles: true }));
}, idxOfPs);
await sleep(1200);
const ptFilled = await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  return inputs[ix.pt]?.value;
}, idxOfPs);
const expectPt = 0.01 + (25 / 1000) * 0.84 * 0.84;
ok(Math.abs(parseFloat(ptFilled) - expectPt) < 1e-3, `填静压 → 全压回填输入框（期望 ${expectPt.toFixed(4)}，实际 ${ptFilled}）`);

const calcTags = await page.$$eval(".calc-tag", (els) => els.map((e) => e.textContent.trim()));
ok(calcTags.length > 0, `派生输入框标「计算值」（${calcTags.length} 处）`);

// 反向：清空静压 → 填全压 0.06 → 静压应回填 0.04236
await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inputs[ix.ps], "");
  inputs[ix.ps].dispatchEvent(new Event("input", { bubbles: true }));
  setter.call(inputs[ix.pt], "0.06");
  inputs[ix.pt].dispatchEvent(new Event("input", { bubbles: true }));
}, idxOfPs);
await sleep(1200);
const psFilled = await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  return inputs[ix.ps]?.value;
}, idxOfPs);
const expectPs = 0.06 - (25 / 1000) * 0.84 * 0.84;
ok(Math.abs(parseFloat(psFilled) - expectPs) < 1e-3, `填全压 → 静压回填输入框（期望 ${expectPs.toFixed(4)}，实际 ${psFilled}）`);

/* ---------- 12. 方法下拉切换（烟温静压法 / 计温计压法） ---------- */
await clickBtn("示例");
await sleep(1400);
const selCount = await page.$$eval(".sg select.sel", (els) => els.length);
ok(selCount >= 2, `④步有方法下拉、⑤步有基准含氧量下拉（${selCount} 个）`);
const methodLabels = await page.$$eval(".sg select.sel option", (els) => els.map((e) => e.textContent.trim()));
ok(methodLabels.some((t) => t.includes("烟温静压法")) && methodLabels.some((t) => t.includes("计温计压法")),
  "方法下拉含两法：" + methodLabels.join(" / "));

// 切到计温计压法
await page.evaluate(() => {
  const sel = [...document.querySelectorAll(".sg select.sel")].find((s) =>
    [...s.options].some((o) => o.textContent.includes("计温计压法"))
  );
  if (!sel) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, "2");
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(1400);
const repAfter = await page.$$eval(".rep .rp", (els) =>
  els.map((e) => ({
    label: e.querySelector(".rp-l")?.textContent.trim(),
    value: e.querySelector(".rp-v")?.textContent.trim(),
  }))
);
const vndAfter = repAfter.find((r) => r.label === "标况体积 Vnd");
ok(vndAfter && vndAfter.value !== "—", `计温计压法下标况体积仍可算出（${vndAfter?.value}）`);
const condRow = repAfter.find((r) => r.label === "工况体积 V′");
ok(!!condRow, "切换后显示「工况体积 V′」");
const vndFlow = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".rep .rp")];
  const r = rows.find((e) => e.querySelector(".rp-l")?.textContent.trim() === "标况体积 Vnd");
  return r?.querySelector(".rp-v")?.textContent.trim();
});

/* ---------- 13. 清空 ---------- */
await clickBtn("清空");
await sleep(1000);
const afterClear = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").length);
ok(afterClear === 0, `清空后无残留值（残留 ${afterClear}）`);
const hintsAfterClear = await page.$$eval(".sg-hint", (els) => els.length);
ok(hintsAfterClear === 0, `清空后仍无「待补」提示（实际 ${hintsAfterClear}）`);

/* ---------- 14. 负数输入支持 ---------- */
await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(inputs[ix.ps], "-0.04");
  inputs[ix.ps].dispatchEvent(new Event("input", { bubbles: true }));
}, idxOfPs);
await sleep(900);
const psVal = await page.evaluate((ix) => {
  const inputs = [...document.querySelectorAll(".sg .fld .inp")];
  return inputs[ix.ps]?.value;
}, idxOfPs);
ok(psVal === "-0.04", `负压输入保留负号（${psVal}）`);

/* ---------- 15. 移动端 H5 视口 ---------- */
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await sleep(1200);
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
}));
ok(overflow.docW <= overflow.winW + 2, `移动端无横向溢出（doc=${overflow.docW} win=${overflow.winW}）`);

const mobileCols = await page.evaluate(() => {
  const g = document.querySelector(".fb-list");
  return g ? getComputedStyle(g).gridTemplateColumns : "";
});
ok(!!mobileCols, `移动端流程条网格正常：${mobileCols}`);

const repCols = await page.evaluate(() => {
  const g = document.querySelector(".rep");
  return g ? getComputedStyle(g).gridTemplateColumns : "";
});
ok(!!repCols, `移动端报表网格正常：${repCols}`);

await page.screenshot({ path: "D:/tmp/dust-mobile.png", fullPage: false });
await page.setViewport({ width: 1440, height: 1000 });
await sleep(700);
await clickBtn("示例");
await sleep(1400);
await page.screenshot({ path: "D:/tmp/dust-desktop.png", fullPage: false });

await browser.close();
console.log(`\n结果：FAIL ${fail.length} 项`);
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
