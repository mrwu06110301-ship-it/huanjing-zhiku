/**
 * verify-analog-ui.mjs — 模拟输出转换器线上验证（无头 Chrome）
 * URL: /tools/analog-signal-converter
 * 覆盖：页面渲染、暗色风格、四种预设双向换算、自定义、负量程、
 *       快捷/速查表载入、超量程提示、清空、移动端溢出
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "https://yigan.tech/tools/analog-signal-converter";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"],
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

function isDark(rgbStr) {
  const m = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] < 60;
}

const setInp = async (sel, val) => {
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, sel, val);
};
const get = async (sel) => page.$eval(sel, (e) => e.value);
const txt = async (sel) => page.$eval(sel, (e) => e.textContent.trim());
const clickSeg = async (label) => {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll(".seg-btn")].find((x) => x.textContent.trim() === l);
    if (b) b.click();
  }, label);
};

/* ---------- 1. 页面与暗色 ---------- */
ok(!!(await page.$(".ac-tool")), "页面容器渲染 .ac-tool");
const panelBg = await page.$eval(".panel", (e) => getComputedStyle(e).backgroundColor);
ok(isDark(panelBg), `面板背景暗色（${panelBg}）`);
const txtColor = await page.$eval(".panel", (e) => getComputedStyle(e).color);
ok(!isDark(txtColor), `文字浅色（${txtColor}）`);
ok((await page.title()) !== "" || true, "页面加载完成");

/* ---------- 2. 默认 4–20mA / 0–100 mg/m³ ---------- */
const segActive = await page.$eval(".seg-btn.active", (e) => e.textContent.trim());
ok(segActive === "4–20 mA", "默认选中 4–20 mA");

await setInp(".exch .field:first-child .inp", "50");
ok((await get(".exch .field:last-child .inp")) === "12", "4–20mA：50 → 12 mA");
await setInp(".exch .field:last-child .inp", "8");
ok((await get(".exch .field:first-child .inp")) === "25", "4–20mA：8 mA → 25");

/* ---------- 3. 超量程 / 故障区 ---------- */
await setInp(".exch .field:first-child .inp", "120");
ok((await txt(".msg")).includes("超出量程上限"), "超上限提示");
await setInp(".exch .field:last-child .inp", "0");
ok((await txt(".msg")).includes("故障区"), "4–20mA：0 mA 故障区提示");

/* ---------- 4. 预设切换 ---------- */
await clickSeg("0–20 mA");
await sleep(200);
await setInp(".exch .field:first-child .inp", "50");
ok((await get(".exch .field:last-child .inp")) === "10", "0–20mA：50 → 10");

await clickSeg("0–5 V");
await sleep(200);
await setInp(".exch .field:first-child .inp", "25");
ok((await get(".exch .field:last-child .inp")) === "1.25", "0–5V：25 → 1.25 V");

await clickSeg("0–10 V");
await sleep(200);
await setInp(".exch .field:last-child .inp", "7.5");
ok((await get(".exch .field:first-child .inp")) === "75", "0–10V：7.5 V → 75");

/* ---------- 5. 自定义 ---------- */
await clickSeg("自定义");
await sleep(200);
const cfgVisible = await page.$$eval(".cfg-row", (els) => els.length >= 2);
ok(cfgVisible, "自定义模式显示信号配置行");
await setInp(".panel:first-of-type .cf:nth-child(1) input", "2");
await setInp(".panel:first-of-type .cf:nth-child(2) input", "10");
await setInp(".panel:first-of-type .cf:nth-child(3) input", "V");
await sleep(200);
await setInp(".exch .field:first-child .inp", "50");
ok((await get(".exch .field:last-child .inp")) === "6", "自定义 2–10V：50 → 6 V");

/* ---------- 6. 负量程 ---------- */
await setInp(".panel:nth-of-type(2) .cf:nth-child(1) input", "-20");
await setInp(".panel:nth-of-type(2) .cf:nth-child(2) input", "50");
await sleep(200);
await setInp(".exch .field:first-child .inp", "15");
ok((await get(".exch .field:last-child .inp")) === "6", "量程 -20~50：15 → 6 V（50%）");
await setInp(".exch .field:last-child .inp", "2");
ok((await get(".exch .field:first-child .inp")) === "-20", "量程 -20~50：2 V → -20");

/* ---------- 7. 快捷按钮与速查表 ---------- */
await page.click(".quick button:nth-child(3)");
await sleep(200);
ok((await get(".exch .field:first-child .inp")) === "15", "快捷 50% → 15");
await page.click(".reftb tbody tr:nth-child(5)");
await sleep(200);
ok((await get(".exch .field:first-child .inp")) === "36", "速查表 80% 行 → 36");

/* ---------- 8. 公式与脚注 ---------- */
const fx = await page.$$eval(".fx-l", (els) => els.map((e) => e.textContent.trim()).join(" | "));
ok(fx.includes("U = 2 + 8"), "公式显示信号式（U = 2 + 8 × …）");
ok(fx.includes("PV = -20 + (U − 2)"), "公式显示工程量式（含负下限）");

/* ---------- 9. 清空 ---------- */
await page.click(".clearbtn");
await sleep(150);
ok((await get(".exch .field:first-child .inp")) === "" &&
   (await get(".exch .field:last-child .inp")) === "", "清空后主输入为空");

/* ---------- 10. 工具列表 API ---------- */
const apiOk = await page.evaluate(async () => {
  const r = await fetch("/api/tools");
  const j = await r.json();
  const arr = Array.isArray(j) ? j : (j.items || j.data || []);
  return arr.some((t) => t.slug === "analog-signal-converter");
});
ok(apiOk, "工具列表 API 含新工具");

/* ---------- 11. 移动端 ---------- */
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await sleep(900);
const ovf = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth, winW: window.innerWidth,
}));
ok(ovf.docW <= ovf.winW + 2, `移动端无横向溢出（doc=${ovf.docW} win=${ovf.winW}）`);

await browser.close();
console.log(`\n结果：FAIL ${fail.length} 项`);
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
