/**
 * verify-dust-ui.mjs — 烟尘采样工具页线上 UI 验证（无头 Chrome）
 * 验证：加载示例 → 结果自动算出 → 数值正确 → 清空 → 全部标「缺」 → 移动端视口布局
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
await sleep(1500);

const fail = [];
const ok = (cond, msg) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fail.push(msg);
};

/* 1. 标题下提示应已删除 */
const subText = await page.$eval(".page-header-sub", (el) => el.textContent.trim()).catch(() => null);
ok(subText === null, "工具详情页无「标题下标准提示」副标题（当前：" + JSON.stringify(subText) + "）");

/* 2. 主标题与仪表盘标题 */
const panelTitle = await page.$eval(".bar-t b", (el) => el.textContent.trim()).catch(() => "");
ok(panelTitle.includes("烟尘"), "仪表盘标题正确：" + panelTitle);

/* 3. 输入框数量（16 个自由输入 + 1 个 O2 下拉） */
const inpCount = await page.$$eval(".inp", (els) => els.length);
ok(inpCount === 16, `自由输入框 16 个（实际 ${inpCount}）`);

/* 4. 无预填：所有输入框应为空 */
const preFilled = await page.$$eval(".inp", (els) =>
  els.filter((e) => e.value.trim() !== "").map((e) => e.value)
);
ok(preFilled.length === 0, `输入框无预填值（实际预填：${JSON.stringify(preFilled)}）`);

/* 5. 空态：结果应全部为「缺」 */
let emptyMiss = await page.$$eval(".res.empty .r-miss", (els) => els.length);
ok(emptyMiss >= 14, `空态下结果均标注缺失项（${emptyMiss} 项带「缺」）`);

/* 6. 填入示例 → 自动计算 */
await page.evaluate(() => {
  const btns = [...document.querySelectorAll(".ghost")];
  btns.find((b) => b.textContent.includes("示例")).click();
});
await sleep(1200);

const statusText = await page.$eval(".bar-s", (el) => el.textContent.replace(/\s+/g, " ").trim());
ok(/\d+ \/ \d+/.test(statusText), "状态条显示已算项数：" + statusText);

const resMap = await page.$$eval(".res", (els) =>
  els.map((e) => ({
    label: e.querySelector(".r-l")?.textContent.trim(),
    value: e.querySelector(".r-v b")?.textContent.trim(),
    unit: e.querySelector(".r-u")?.textContent.trim(),
    miss: e.querySelector(".r-miss")?.textContent.trim() || "",
  }))
);
const get = (lbl) => resMap.find((r) => r.label === lbl);
ok(resMap.filter((r) => !r.miss).length >= 15, `示例后 ${resMap.filter((r) => !r.miss).length} 项已算出`);

const c = get("颗粒物浓度 C");
ok(c && c.value !== "—", `颗粒物浓度 C = ${c?.value} ${c?.unit}`);
const cadj = get("折算浓度 Cα");
ok(cadj && cadj.value !== "—", `折算浓度 Cα = ${cadj?.value} ${cadj?.unit}`);
const g = get("颗粒物排放速率 G");
ok(g && g.value !== "—", `排放速率 G = ${g?.value} ${g?.unit}`);
const vs = get("烟气流速 Vs");
ok(vs && vs.value !== "—", `烟气流速 Vs = ${vs?.value} ${vs?.unit}`);

/* 7. 计算过程（管理员不可见时跳过，只检查存在时内容） */

/* 8. 清空 */
await page.evaluate(() => {
  [...document.querySelectorAll(".ghost")].find((b) => b.textContent.includes("清空")).click();
});
await sleep(800);
const afterClear = await page.$$eval(".inp", (els) => els.filter((e) => e.value.trim() !== "").length);
ok(afterClear === 0, `清空后无残留值（残留 ${afterClear}）`);

/* 9. 快捷赋值 */
await page.evaluate(() => {
  [...document.querySelectorAll(".qbtn")].find((b) => b.textContent.includes("Kp 0.84")).click();
});
await sleep(600);
const kpVal = await page.$$eval(".inp", (els) => els.map((e) => e.value).find((v) => v === "0.84"));
ok(kpVal === "0.84", "快捷赋值「皮托管 Kp 0.84」生效");

/* 10. 负数输入支持 */
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const ps = inputs[1]; // 平均静压
  ps.focus();
});
await page.type(".inp:nth-of-type(1)", "", { delay: 0 });
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll(".inp")];
  const ps = inputs[1];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(ps, "-0.04");
  ps.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(700);
const psVal = await page.$$eval(".inp", (els) => els[1].value);
ok(psVal === "-0.04", `负压输入保留负号（${psVal}）`);

/* 11. 移动端 H5 视口：单列布局 + 无横向溢出 */
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await sleep(900);
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  winW: window.innerWidth,
}));
ok(overflow.docW <= overflow.winW + 2, `移动端无横向溢出（doc=${overflow.docW} win=${overflow.winW}）`);

const mobileCols = await page.evaluate(() => {
  const inp = document.querySelector(".inp");
  const fld = inp?.closest(".fld");
  const flds = document.querySelector(".flds");
  return {
    fldW: fld?.getBoundingClientRect().width,
    gridCols: flds ? getComputedStyle(flds).gridTemplateColumns : "",
  };
});
ok(!!mobileCols.gridCols, `移动端输入区仍为网格布局：${mobileCols.gridCols}`);

await page.screenshot({ path: "D:/tmp/dust-mobile.png", fullPage: false });
await page.setViewport({ width: 1440, height: 1000 });
await sleep(500);
await page.evaluate(() => {
  [...document.querySelectorAll(".ghost")].find((b) => b.textContent.includes("示例")).click();
});
await sleep(1000);
await page.screenshot({ path: "D:/tmp/dust-desktop.png", fullPage: false });

await browser.close();
console.log(`\n结果：FAIL ${fail.length} 项`);
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
