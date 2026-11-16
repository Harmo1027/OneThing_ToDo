import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";
import { openTodo } from "./test-browser-helpers.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "background-"));
const imagePath = path.join(dataDirectory, "sample-background.svg");
await writeFile(imagePath, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3a6f"/><stop offset=".52" stop-color="#2b7fd4"/><stop offset="1" stop-color="#ffd479"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="300" cy="260" r="150" fill="#69d2ff" opacity=".55"/>
  <circle cx="900" cy="540" r="210" fill="#7b5cff" opacity=".45"/>
  <path d="M0 680 400 420l280 210 220-160 300 230v100H0z" fill="#08213c" opacity=".65"/>
</svg>`);
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const dialog = page.locator("#background-dialog");
  const state = () => page.evaluate(() => ({
    background: document.documentElement.dataset.background || null,
    backgroundVar: document.documentElement.style.getPropertyValue("--custom-bg-image"),
    display: getComputedStyle(document.querySelector(".app-backdrop")).display,
    filter: getComputedStyle(document.querySelector(".app-backdrop")).filter,
    active: document.querySelector("#background-button").classList.contains("is-active"),
    label: document.querySelector("#background-button").getAttribute("aria-label"),
    saved: localStorage.getItem("yijian.background.v1"),
    savedBlur: localStorage.getItem("yijian.backgroundBlur.v1"),
    blurVar: document.documentElement.style.getPropertyValue("--bg-blur"),
    cardBlurVar: document.documentElement.style.getPropertyValue("--card-blur"),
    cardBlurSaved: localStorage.getItem("yijian.cardBlur.v1")
  }));
  const cardFilter = () => page.locator("#task-list .task-card").first().evaluate(card => getComputedStyle(card).backdropFilter);
  const setBackgroundBlur = value => page.locator("#background-blur").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await page.goto(base);
  await openTodo(page);
  let current = await state();
  assert.equal(current.background, null);
  assert.equal(current.display, "none");
  assert.equal(current.active, false);
  assert.equal(current.saved, null);
  assert.equal(current.savedBlur, null);
  assert.equal(current.blurVar, "");
  assert.equal(current.cardBlurVar, "");
  assert.equal(await page.locator("#background-blur").isDisabled(), true);
  assert.equal(await page.locator("#background-blur-value").textContent(), "20 px");
  await page.locator("#task-heading").fill("自定义背景检查");
  await page.locator("#task-input").fill("卡片背后的照片需要柔化，文字仍然清晰。");
  await page.locator("#add-form .add-button").click();
  assert.match(await cardFilter(), /blur\(26px\)/, "卡片磨砂应比背景模糊更重");

  await page.locator("#background-button").click();
  assert.equal(await dialog.evaluate(node => node.open), true);
  assert.equal(await page.locator("#background-remove").isDisabled(), true);
  assert.equal(await page.locator("#background-blur").isDisabled(), true);
  assert.equal(await page.locator("#background-preview").evaluate(node => node.classList.contains("has-image")), false);
  await page.locator("#background-file").setInputFiles(imagePath);
  await page.waitForFunction(() => document.documentElement.dataset.background === "custom" && document.querySelector("#background-status").textContent.includes("背景已更新"), null, { timeout: 8000 });
  current = await state();
  assert.match(current.saved, /^data:image\/(webp|png);base64,/);
  assert.ok(current.saved.length < 3000000, "背景应压缩后保存");
  assert.match(current.backgroundVar, /^url\("data:image\//);
  assert.equal(current.display, "block");
  assert.match(current.filter, /blur\(20px\)/);
  assert.equal(current.blurVar, "20px");
  assert.equal(current.cardBlurVar, "26px");
  assert.equal(current.active, true);
  assert.equal(current.label, "更换自定义背景");
  assert.equal(await page.locator("#background-remove").isDisabled(), false);
  assert.equal(await page.locator("#background-blur").isDisabled(), false);
  assert.equal(await page.locator("#background-preview").evaluate(node => node.classList.contains("has-image")), true);
  assert.match(await page.locator("#background-preview-image").getAttribute("src"), /^data:image\//);
  assert.match(await page.locator("#background-status").textContent(), /背景已更新/);
  await setBackgroundBlur(0);
  current = await state();
  assert.equal(current.blurVar, "0px");
  assert.equal(current.cardBlurVar, "26px");
  assert.equal(current.savedBlur, "0");
  assert.match(await cardFilter(), /blur\(26px\)/, "背景清晰时卡片仍保留磨砂");
  await setBackgroundBlur(32);
  current = await state();
  assert.equal(current.blurVar, "32px");
  assert.equal(current.cardBlurVar, "26px");
  assert.equal(current.savedBlur, "32");
  assert.match(current.filter, /blur\(32px\)/);
  assert.match(await cardFilter(), /blur\(26px\)/, "卡片磨砂与背景磨砂独立");
  assert.equal(await page.locator("#background-blur-value").textContent(), "32 px");
  await page.locator("#background-done").click();
  assert.equal(await dialog.evaluate(node => node.open), false);
  await page.screenshot({ path: path.join(dataDirectory, "background-light.png") });

  await page.reload();
  await openTodo(page);
  const restored = await state();
  assert.equal(restored.background, "custom");
  assert.equal(restored.display, "block");
  assert.equal(restored.active, true);
  assert.equal(restored.savedBlur, "32");
  assert.equal(restored.blurVar, "32px");
  assert.equal(restored.cardBlurVar, "26px");
  assert.equal(await page.locator("#background-blur").inputValue(), "32");
  assert.equal(await page.locator("#background-blur").isDisabled(), false);
  assert.match(await cardFilter(), /blur\(26px\)/, "刷新后卡片磨砂独立保留");
  assert.equal(await page.locator("#background-preview-image").getAttribute("src"), restored.saved);
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.match((await state()).filter, /blur\(32px\)/);
  await page.screenshot({ path: path.join(dataDirectory, "background-dark.png") });

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `页面溢出 ${width}`);
    await page.locator("#background-button").click();
    assert.equal(await dialog.evaluate(node => node.open), true);
    assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true, `背景弹窗溢出 ${width}`);
    const preview = await page.locator("#background-preview").boundingBox();
    assert.ok(preview && preview.x >= 0 && preview.x + preview.width <= width, `背景预览越界 ${width}`);
    assert.equal(await page.locator("#background-blur").isDisabled(), false);
    assert.equal(await page.locator("#background-blur").inputValue(), "32");
    const slider = await page.locator("#background-blur").boundingBox();
    assert.ok(slider && slider.x >= 0 && slider.x + slider.width <= width, `磨砂滑杆越界 ${width}`);
    const cardSlider = await page.locator("#card-blur").boundingBox();
    assert.ok(cardSlider && cardSlider.x >= 0 && cardSlider.x + cardSlider.width <= width, `卡片磨砂滑杆越界 ${width}`);
    if (width === 375) await page.screenshot({ path: path.join(dataDirectory, "background-mobile-dialog.png") });
    await page.locator("#background-close").click();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#background-button").click();
  await page.locator("#background-remove").click();
  current = await state();
  assert.equal(current.background, null);
  assert.equal(current.backgroundVar, "");
  assert.equal(current.display, "none");
  assert.equal(current.active, false);
  assert.equal(current.saved, null);
  assert.equal(current.blurVar, "");
  assert.equal(current.cardBlurVar, "");
  assert.equal(current.savedBlur, "32");
  assert.equal(await page.locator("#background-remove").isDisabled(), true);
  assert.equal(await page.locator("#background-blur").isDisabled(), true);
  assert.equal(await page.locator("#background-preview").evaluate(node => node.classList.contains("has-image")), false);
  assert.match(await page.locator("#background-status").textContent(), /已恢复默认背景/);
  assert.match(await cardFilter(), /blur\(26px\)/, "移除背景后卡片恢复默认磨砂");
  await page.locator("#background-done").click();
  await page.reload();
  await openTodo(page);
  current = await state();
  assert.equal(current.background, null);
  assert.equal(current.blurVar, "");
  assert.equal(current.cardBlurVar, "");
  assert.equal(current.savedBlur, "32");
  assert.equal(await page.locator("#background-blur").isDisabled(), true);
  assert.equal(await page.locator("#background-blur").inputValue(), "32");
  assert.match(await cardFilter(), /blur\(26px\)/);

  await page.evaluate(() => localStorage.setItem("yijian.background.v1", "data:text/html;base64,PHNjcmlwdD4="));
  await page.reload();
  await openTodo(page);
  current = await state();
  assert.equal(current.background, null, "无效的背景数据不应生效");
  assert.equal(current.blurVar, "");
  assert.equal(current.cardBlurVar, "");
  await page.evaluate(() => {
    localStorage.removeItem("yijian.background.v1");
    localStorage.removeItem("yijian.backgroundBlur.v1");
  });

  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.cardBlur.v1")), "26");
  assert.match(await cardFilter(), /blur\(26px\)/);
  await page.locator("#background-button").click();
  assert.equal(await dialog.evaluate(node => node.open), true);
  assert.equal(await page.locator("#card-blur").isVisible(), true);
  assert.equal(await page.locator("#card-blur").isDisabled(), false);
  assert.equal(await page.locator("#card-blur").inputValue(), "26");
  assert.match(await page.locator("#card-blur-hint").textContent(), /独立控制/);
  const setCardBlur = value => page.locator("#card-blur").evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await setCardBlur(0);
  assert.equal((await state()).cardBlurVar, "0px");
  assert.match(await cardFilter(), /blur\(0px\)/, "卡片磨砂可调至关闭");
  assert.equal(await page.locator("#card-blur-value").textContent(), "0 px");
  await setCardBlur(46);
  assert.equal((await state()).cardBlurVar, "46px");
  assert.match(await cardFilter(), /blur\(46px\)/, "滑杆可直接设置卡片模糊");
  assert.equal(await page.locator("#card-blur-value").textContent(), "46 px");
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.cardBlur.v1")), "46");
  await page.screenshot({ path: path.join(dataDirectory, "background-card-blur.png"), fullPage: true });
  await page.locator("#background-done").click();
  await page.reload();
  await openTodo(page);
  current = await state();
  assert.equal(current.cardBlurVar, "46px");
  assert.match(await cardFilter(), /blur\(46px\)/, "刷新后保留卡片磨砂滑杆值");
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.cardBlur.v1")), "46");
  await page.locator("#background-button").click();
  assert.equal(await page.locator("#card-blur").inputValue(), "46");
  await setCardBlur(26);
  assert.equal((await state()).cardBlurVar, "");
  assert.match(await cardFilter(), /blur\(26px\)/, "恢复默认卡片磨砂");
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.cardBlur.v1")), "26");
  await page.locator("#background-done").click();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "custom background passed", dataDirectory, savedBytes: restored.saved.length }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
