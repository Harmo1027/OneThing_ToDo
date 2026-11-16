import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";
import { openTodo } from "./test-browser-helpers.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "preview-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const preview = page.locator("#task-preview-dialog");
  const previewTitle = page.locator("#task-preview-title");
  const previewContent = page.locator("#task-preview-content");
  const previewCopy = page.locator("#task-preview-copy");
  const previewHint = page.locator("#task-preview-hint");
  const mainCard = () => page.locator("#task-list .task-card").filter({ hasText: "预览详情任务" });
  const settle = async () => { await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 }); await page.waitForTimeout(700); };
  const openPreview = async (card, position = { x: 44, y: 72 }) => {
    await card.scrollIntoViewIfNeeded();
    await card.click({ position });
    await preview.waitFor({ state: "visible" });
  };
  const closePreview = async () => {
    await preview.press("Escape");
    await preview.waitFor({ state: "hidden" });
  };
  const title = "预览详情任务";
  const content = "第一段正文内容。\n第二段更长一些的内容，用来检查详情面板的展示与复制。\n第三段继续补充细节，确保换行和排版完整保留。";
  const longContent = Array.from({ length: 24 }, (_, index) => `第 ${index + 1} 段：用于检查超长正文在详情面板内滚动，而不把浮层撑到铺满屏幕。`).join("\n");

  await page.goto(base);
  await openTodo(page);
  await settle();

  await page.locator("#add-group-button").click();
  await page.locator("#group-name").fill("资料");
  await page.locator("#group-form .primary-button").click();
  await page.locator('#custom-groups [data-group-id]').filter({ hasText: "资料" }).click();
  await settle();
  await page.locator("#task-heading").fill(title);
  await page.locator("#task-input").fill(content);
  await page.locator("#task-homework").setChecked(true);
  await page.locator("#task-priority").selectOption("urgent");
  await page.locator(".add-button").click();
  await page.waitForFunction(text => [...document.querySelectorAll("#task-list .task-card .task-title")].some(node => node.textContent === text), title);
  await page.waitForTimeout(400);

  assert.equal(await preview.evaluate(node => node.open), false, "默认不展开详情");
  assert.equal(await preview.evaluate(node => node.classList.contains("task-preview-dialog")), true);

  await openPreview(mainCard());
  const opening = await preview.evaluate(node => {
    const keyframes = node.getAnimations().flatMap(animation => animation.effect?.getKeyframes?.() || []);
    return {
      animationName: getComputedStyle(node).animationName,
      animations: node.getAnimations().length,
      duration: node.getAnimations()[0]?.effect?.getTiming().duration,
      startsBlurred: keyframes.some(frame => /blur\(12px\)/.test(frame.filter || "")),
      startsScaled: keyframes.some(frame => /scale\(/.test(frame.transform || "")),
      selected: getComputedStyle(node.querySelector(".task-preview-content")).userSelect,
      title: node.querySelector(".task-preview-title").textContent,
      content: node.querySelector(".task-preview-content").textContent,
      meta: node.querySelector(".task-preview-meta").textContent,
      group: node.querySelector(".task-preview-group").textContent,
      active: document.activeElement?.id
    };
  });
  assert.equal(opening.animationName, "none", "详情浮层使用卡片形变而不是默认弹窗动画");
  assert.ok(opening.animations >= 1, "点击卡片后播放展开动画");
  assert.equal(opening.duration, 480);
  assert.equal(opening.startsBlurred, true, "展开动画从模糊开始");
  assert.equal(opening.startsScaled, true, "展开动画从卡片尺寸放大");
  assert.equal(opening.title, title);
  assert.equal(opening.content, content, "详情保留完整正文和换行");
  assert.match(opening.meta, /紧迫/);
  assert.match(opening.meta, /作业/);
  assert.match(opening.meta, /创建于/);
  assert.match(opening.group, /资料/);
  assert.equal(opening.selected, "text", "正文可选中复制");
  assert.equal(opening.active, "task-preview-close", "展开后焦点进入详情浮层");

  await page.waitForTimeout(620);
  const layout = await preview.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const backdrop = getComputedStyle(node, "::backdrop");
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, vw: innerWidth, vh: innerHeight, backdrop: backdrop.backdropFilter, backdropBg: backdrop.backgroundColor, animations: node.getAnimations().length };
  });
  assert.ok(layout.width <= 721 && layout.width >= 680, `桌面浮层宽度应更大 ${layout.width}`);
  assert.ok(layout.height >= 430, `桌面浮层高度应更舒展 ${layout.height}`);
  assert.ok(layout.width < layout.vw - 100 && layout.height < layout.vh - 100, "详情浮层不铺满屏幕");
  assert.ok(Math.abs(layout.x + layout.width / 2 - layout.vw / 2) <= 1.5, "浮层水平居中");
  assert.ok(Math.abs(layout.y + layout.height / 2 - layout.vh / 2) <= 1.5, "浮层垂直居中");
  assert.match(layout.backdrop, /blur\(30px\)/, "背景用更强的高斯模糊区分浮层");
  assert.equal(layout.backdropBg, "rgba(0, 0, 0, 0)", "背景不变暗，只做模糊");
  assert.equal(layout.animations, 0, "展开动画结束后回到静态");

  const selectedText = await page.evaluate(() => {
    const content = document.querySelector("#task-preview-content");
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });
  assert.equal(selectedText, content, "正文可以直接框选");
  await page.evaluate(() => window.getSelection().removeAllRanges());

  await page.locator("#toast").evaluate(node => node.classList.remove("visible"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(dataDirectory, "preview-desktop.png") });

  await previewCopy.click();
  await page.waitForFunction(() => document.querySelector("#task-preview-copy").textContent !== "复制内容", null, { timeout: 3000 });
  assert.equal(await previewCopy.textContent(), "已复制");
  assert.equal(await previewHint.textContent(), "已复制到剪贴板");
  const clipboard = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  assert.equal(clipboard, `${title}\n\n${content}`, "复制内容包含标题与完整正文");
  await page.waitForTimeout(1700);
  assert.equal(await previewCopy.textContent(), "复制内容", "复制反馈自动复位");

  const closingAnimation = await (async () => {
    await preview.press("Escape");
    const count = await preview.evaluate(node => node.open ? node.getAnimations().length : 0);
    await preview.waitFor({ state: "hidden" });
    return count;
  })();
  assert.ok(closingAnimation >= 1, "关闭时播放回缩动画");
  assert.equal(await preview.evaluate(node => node.open), false);
  assert.equal(await mainCard().count(), 1, "关闭详情不删除待办");

  await openPreview(mainCard());
  await page.waitForTimeout(560);
  await page.locator("#task-preview-close").click();
  await preview.waitFor({ state: "hidden" });

  await openPreview(mainCard());
  await page.waitForTimeout(560);
  await page.mouse.click(6, 6);
  await preview.waitFor({ state: "hidden" });

  await mainCard().locator(".fold-button").click();
  await page.waitForTimeout(300);
  assert.equal(await preview.evaluate(node => node.open), false, "折叠按钮不触发详情");
  assert.equal(await mainCard().evaluate(node => node.classList.contains("is-collapsed")), true);
  await mainCard().locator(".fold-button").click();
  await page.waitForTimeout(300);

  await mainCard().locator(".edit-button").click();
  await page.locator("#edit-dialog").waitFor({ state: "visible" });
  assert.equal(await preview.evaluate(node => node.open), false, "编辑按钮不触发详情");
  await page.locator("#edit-content").fill(longContent);
  await page.locator("#edit-form .primary-button").click();
  await page.locator("#edit-dialog").waitFor({ state: "hidden" });
  await page.waitForTimeout(350);

  await openPreview(mainCard());
  await page.waitForTimeout(560);
  const longLayout = await preview.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const body = node.querySelector(".task-preview-body");
    return { height: rect.height, vh: innerHeight, bodyHeight: body.clientHeight, scrollHeight: body.scrollHeight, overflow: getComputedStyle(body).overflowY, width: rect.width, vw: innerWidth };
  });
  assert.ok(longLayout.height <= Math.min(longLayout.vh * .86, 820) + 1, "超长正文不撑破高度上限");
  assert.ok(longLayout.height < longLayout.vh - 100, "超长正文也不铺满屏幕");
  assert.ok(longLayout.scrollHeight > longLayout.bodyHeight, "超长正文在面板内部滚动");
  assert.match(longLayout.overflow, /auto/);
  await page.screenshot({ path: path.join(dataDirectory, "preview-long.png") });
  await closePreview();

  await mainCard().locator(".pin-button").click();
  await page.waitForTimeout(700);
  assert.equal(await preview.evaluate(node => node.open), false, "置顶按钮不触发详情");
  const pinnedCard = page.locator("#pinned-list .task-card").filter({ hasText: title });
  assert.equal(await pinnedCard.count(), 1);
  await openPreview(pinnedCard, { x: 32, y: 54 });
  assert.equal(await previewTitle.textContent(), title, "置顶卡片也可展开详情");
  await closePreview();

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(400);
  await openPreview(mainCard());
  await page.waitForTimeout(620);
  const dark = await preview.evaluate(node => { const s = getComputedStyle(node); const backdrop = getComputedStyle(node, "::backdrop"); return { bg: s.backgroundColor, bgImage: s.backgroundImage, color: s.color, backdrop: backdrop.backdropFilter, backdropBg: backdrop.backgroundColor }; });
  assert.match(dark.bgImage, /linear-gradient/, "深色详情浮层保留玻璃渐变");
  assert.match(dark.backdrop, /blur\(30px\)/);
  assert.equal(dark.backdropBg, "rgba(0, 0, 0, 0)", "深色背景同样只模糊不变暗");
  await page.screenshot({ path: path.join(dataDirectory, "preview-dark.png") });
  await closePreview();
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(450);
  await openPreview(mainCard(), { x: 36, y: 64 });
  await page.waitForTimeout(620);
  const mobile = await preview.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, width: rect.width, height: rect.height, vw: innerWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth <= innerWidth };
  });
  assert.ok(mobile.width <= mobile.vw - 16, "移动端详情保留屏幕边距");
  assert.ok(mobile.height <= mobile.vh * .9, "移动端详情不铺满屏幕");
  assert.ok(mobile.x >= 8, "移动端浮层不越出左侧");
  assert.equal(mobile.overflow, true, "移动端展开详情不产生横向溢出");
  await page.screenshot({ path: path.join(dataDirectory, "preview-mobile.png") });
  await closePreview();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(350);
  await mainCard().locator(".complete-button").click();
  await page.waitForFunction(text => [...document.querySelectorAll("#completed-list .task-card .task-title")].some(node => node.textContent === text), title);
  const completedCard = page.locator("#completed-list .task-card").filter({ hasText: title });
  assert.equal(await completedCard.count(), 1);
  await openPreview(completedCard, { x: 36, y: 64 });
  assert.equal(await previewTitle.textContent(), title, "已完成卡片也可展开详情");
  assert.match(await preview.locator(".task-preview-meta").textContent(), /已完成/);
  assert.match(await previewContent.textContent(), /第 1 段/);
  await closePreview();
  assert.equal(await page.evaluate(() => Boolean(document.querySelector("dialog[open]"))), false);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(completedCard, { x: 36, y: 64 });
  assert.equal(await preview.evaluate(node => node.getAnimations().length), 0, "减少动态效果时跳过展开动画");
  assert.equal(await previewTitle.textContent(), title);
  await preview.press("Escape");
  await preview.waitFor({ state: "hidden" });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "task preview passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
