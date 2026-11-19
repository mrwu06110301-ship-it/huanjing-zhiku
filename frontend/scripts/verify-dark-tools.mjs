/**
 * verify-dark-tools.mjs — 四工具页暗色风格统一验证（无头 Chrome）
 * 页面：大气稳定度 / 单位换算 / 紫外烟气 / 阻容含湿量
 * 断言：容器为暗色仪表盘（bg≈#0f1419）、卡片/输入框深色、无横向溢出、
 *       烟尘采样模型作为基准对照
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "https://yigan.tech/tools/";
const PAGES = [
  { name: "大气稳定度", url: BASE + "atmospheric-stability", root: ".atm-tool" },
  { name: "单位换算", url: BASE + "unit-converter", root: ".uc-tool" },
  { name: "紫外烟气模型", url: BASE + "doas-model", root: ".uv-tool" },
  { name: "阻容含湿量", url: BASE + "rc-moisture", root: ".rm-tool" },
  { name: "烟尘采样模型(基准)", url: BASE + "pollution-source-model", root: ".ds" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });

const fail = [];
const ok = (cond, msg) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fail.push(msg);
};

/** 判定颜色是否暗色（亮度 < 60） */
function isDarkColor(rgbStr) {
  const m = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [, r, g, b] = m.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
}

for (const p of PAGES) {
  console.log("\n===== " + p.name + " " + "=".repeat(Math.max(0, 40 - p.name.length)));
  await page.goto(p.url, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1800);

  // 1. 根容器存在
  const rootExists = await page.$(p.root);
  ok(!!rootExists, "页面容器渲染：" + p.root);

  // 2. 根容器背景为暗色
  const rootBg = await page.$eval(p.root, (e) => getComputedStyle(e).backgroundColor);
  ok(isDarkColor(rootBg), `容器背景暗色（${rootBg}）`);

  // 3. 卡片/面板背景暗色 + 文字浅色（取第一个卡片类元素——真实表面）
  const cardSel = p.root === ".ds" ? ".panel" : ".card, .input-card";
  const cardInfo = await page.$$eval(cardSel, (els) =>
    els.length ? {
      bg: getComputedStyle(els[0]).backgroundColor,
      color: getComputedStyle(els[0]).color,
    } : null);
  ok(cardInfo && isDarkColor(cardInfo.bg), `卡片背景暗色（${cardInfo?.bg}）`);
  ok(cardInfo && !isDarkColor(cardInfo.color), `卡片文字浅色（${cardInfo?.color}）`);

  // 5. 无残留亮色大面板（检查白底卡片 = 未改完的样式）
  const whiteCards = await page.$$eval(
    p.root + " .card, " + p.root + " .input-card, " + p.root + " .panel, " + p.root + " .report-card",
    (els) => els.filter((e) => {
      const bg = getComputedStyle(e).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      return 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3] > 200;
    }).length
  );
  ok(whiteCards === 0, `无白底卡片残留（${whiteCards} 个）`);

  // 6. 桌面端无横向溢出
  const ovfD = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth, winW: window.innerWidth,
  }));
  ok(ovfD.docW <= ovfD.winW + 2, `桌面无横向溢出（doc=${ovfD.docW} win=${ovfD.winW}）`);

  // 7. 移动端无横向溢出
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await sleep(1000);
  const ovfM = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth, winW: window.innerWidth,
  }));
  ok(ovfM.docW <= ovfM.winW + 2, `移动端无横向溢出（doc=${ovfM.docW} win=${ovfM.winW}）`);
  await page.setViewport({ width: 1440, height: 1000 });
}

await browser.close();
console.log("\n结果：FAIL " + fail.length + " 项");
if (fail.length) fail.forEach((f) => console.log("  - " + f));
process.exit(fail.length ? 1 : 0);
