import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "focus-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const now = new Date("2026-11-13T12:00:00+08:00");
const DAY = 86400000;
const focusContent = "1. 整理第三季度数据\n2. 完成演示文稿结构\n3. 核对关键指标口径\n4. 预留十分钟预演";
const seed = {
  version: 2,
  modifiedAt: now.getTime(),
  groups: [{ id: "group-work", name: "工作" }],
  dailyTasks: [],
  tasks: [
    { id: "focus-task-main", title: "季度汇报", content: focusContent, completed: false, completedAt: 0, reviews: [0, 0, 0, 0], groupId: "group-work", createdAt: now.getTime() - 3 * DAY, collapsed: false, dueDate: "2026-11-20", priority: "urgent", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "focus-task-other", title: "阅读《深度工作》", content: "第二章：专注的力量。", completed: false, completedAt: 0, reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - 2 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "focus-task-done", title: "已完成的任务", content: "不应出现在待办选择列表。", completed: true, completedAt: now.getTime() - DAY, reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - 4 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 }
  ]
};
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai" });
  await context.addInitScript(state => localStorage.setItem("yijian.workspace.v2", JSON.stringify(state)), seed);
  await context.addInitScript(() => {
    Element.prototype.requestFullscreen = function () { return Promise.reject(new Error("Fullscreen blocked for test")); };
  });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: now });
  const overlay = page.locator("#focus-overlay");
  const start = page.locator("#focus-start");
  const countdown = page.locator("#focus-countdown");
  const settle = async () => { await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 }); await page.waitForTimeout(700); };
  const hideToast = () => page.evaluate(() => document.querySelector("#toast").classList.remove("visible"));
  const openFocus = async () => { await page.locator('#workspace-switcher [data-workspace="focus"]').click(); await page.locator("#focus-view").waitFor({ state: "visible" }); await settle(); };
  const startFocus = async () => { await start.click(); await overlay.waitFor({ state: "visible" }); await page.waitForTimeout(300); };
  const finishByShortcut = async () => { await page.keyboard.press("Meta+Escape"); await overlay.waitFor({ state: "hidden" }); await page.waitForTimeout(250); };

  await page.goto(base);
  assert.equal(await page.locator("#workspace-switcher .workspace-button").count(), 4);
  await openFocus();
  assert.equal(await page.locator("#breadcrumb-current").textContent(), "专注钟");
  assert.equal(await page.title(), "专注钟 · 一件");
  assert.equal(await page.locator('#workspace-switcher [data-workspace="focus"]').getAttribute("aria-current"), "page");
  assert.equal(await page.locator("#focus-duration-display").textContent(), "25:00");
  assert.equal(await page.locator("#focus-minutes").inputValue(), "25");
  assert.equal(await page.locator(".focus-presets button.active").count(), 1);
  assert.equal(await page.locator(".focus-presets button.active").textContent(), "25 分钟");
  assert.equal(await overlay.isVisible(), false);
  assert.match(await page.locator(".focus-note").textContent(), /Win\+Esc/);
  assert.match(await page.locator(".focus-note").textContent(), /无法真正锁定/);
  assert.equal(await page.locator("#focus-task").inputValue(), "");
  assert.equal(await page.locator('#focus-task option[value="focus-task-main"]').count(), 1);
  assert.equal(await page.locator('#focus-task option[value="focus-task-other"]').count(), 1);
  assert.equal(await page.locator('#focus-task option[value="focus-task-done"]').count(), 0, "已完成待办不进入选择列表");
  await page.locator("#focus-task").selectOption("focus-task-main");
  assert.equal(await page.locator("#focus-task").inputValue(), "focus-task-main");
  assert.equal(await page.locator("#focus-task-preview").isVisible(), true);
  assert.equal(await page.locator("#focus-task-preview-group").textContent(), "工作");
  assert.equal(await page.locator("#focus-task-preview-title").textContent(), "季度汇报");
  assert.equal(await page.locator("#focus-task-preview-due").textContent(), "11/20 截止");
  assert.match(await page.locator("#focus-task-preview-content").textContent(), /核对关键指标口径/);
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.focusTaskId")), "focus-task-main");
  await page.screenshot({ path: path.join(dataDirectory, "focus-setup.png"), fullPage: true });

  await page.locator('.focus-presets [data-minutes="45"]').click();
  assert.equal(await page.locator("#focus-duration-display").textContent(), "45:00");
  assert.equal(await page.locator("#focus-minutes").inputValue(), "45");
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.focusMinutes")), "45");
  await page.locator("#focus-minutes").fill("1");
  await page.locator("#focus-minutes").dispatchEvent("change");
  assert.equal(await page.locator("#focus-duration-display").textContent(), "01:00");
  assert.equal(await page.locator(".focus-presets button.active").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("yijian.focusMinutes")), "1");

  await startFocus();
  assert.equal(await countdown.textContent(), "01:00");
  assert.equal(await page.locator("#focus-overlay-total").textContent(), "1 分钟专注");
  assert.equal(await page.locator("#focus-overlay-task").isVisible(), true);
  assert.equal(await page.locator("#focus-overlay-task-title").textContent(), "季度汇报");
  assert.equal(await page.locator("#focus-overlay-task-content").textContent(), focusContent, "专注界面完整显示待办正文");
  assert.equal(await page.locator("#focus-overlay-task-group").textContent(), "工作");
  assert.equal(await page.locator("#focus-overlay-task-due").textContent(), "11/20 截止");
  const taskVisibility = await page.locator("#focus-overlay-task").evaluate(node => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
  assert.ok(taskVisibility.scrollHeight <= taskVisibility.clientHeight + 1, "中等长度待办内容应完整显示");
  assert.equal(await page.locator("#focus-overlay-status").textContent(), "未进入浏览器全屏，专注界面仍会保留。");
  assert.equal(await page.locator("#focus-reenter").isVisible(), true);
  assert.equal(await page.evaluate(() => document.querySelector(".app-shell").inert), true);
  assert.equal(await page.evaluate(() => document.body.classList.contains("focus-locked")), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "focus-overlay-content");
  const overlayBox = await overlay.boundingBox();
  assert.ok(overlayBox && overlayBox.width === 1440 && overlayBox.height === 1000, "专注界面覆盖整个网页");
  assert.match(await page.title(), /01:00 · 专注中/);
  await hideToast();
  await page.screenshot({ path: path.join(dataDirectory, "focus-overlay.png"), fullPage: true });

  await page.clock.fastForward(30 * 1000);
  await page.waitForTimeout(150);
  assert.equal(await countdown.textContent(), "00:30");
  assert.ok(Number(await page.locator("#focus-overlay-progress").evaluate(node => node.style.strokeDashoffset)) > 0, "进度环随专注时间推进");
  await finishByShortcut();
  assert.equal(await page.locator("#focus-feedback").textContent(), "本次专注 不到 1 分钟，已结束。");
  assert.equal(await page.evaluate(() => document.querySelector(".app-shell").inert), false);
  assert.equal(await page.evaluate(() => document.body.classList.contains("focus-locked")), false);
  assert.equal(await page.title(), "专注钟 · 一件");

  await startFocus();
  await page.keyboard.down("Escape");
  await page.clock.runFor(3100);
  await page.keyboard.up("Escape");
  await overlay.waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  assert.match(await page.locator("#focus-feedback").textContent(), /已结束/);

  await startFocus();
  const exitBox = await page.locator("#focus-exit").boundingBox();
  await page.mouse.move(exitBox.x + exitBox.width / 2, exitBox.y + exitBox.height / 2);
  await page.mouse.down();
  await page.clock.runFor(3100);
  await page.mouse.up();
  await overlay.waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  assert.match(await page.locator("#focus-feedback").textContent(), /已结束/);
  await page.clock.runFor(600);

  await startFocus();
  await page.clock.fastForward(61000);
  await overlay.waitFor({ state: "hidden" });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#focus-feedback").textContent(), "本次专注 1 分钟完成，休息一下。");
  assert.equal(await page.locator("#toast").textContent(), "专注完成，辛苦了");
  assert.equal(await page.title(), "专注钟 · 一件");
  assert.equal(await start.isEnabled(), true);
  await hideToast();

  await page.locator('#workspace-switcher [data-workspace="calendar"]').click();
  await settle();
  await openFocus();
  assert.equal(await page.locator("#focus-duration-display").textContent(), "01:00");
  assert.equal(await page.locator("#focus-minutes").inputValue(), "1");
  await page.reload();
  await page.waitForLoadState();
  await openFocus();
  assert.equal(await page.locator("#focus-minutes").inputValue(), "1", "刷新后记住自定义时长");
  assert.equal(await page.locator("#focus-task").inputValue(), "focus-task-main", "刷新后记住所选待办");
  assert.equal(await page.locator("#focus-task-preview").isVisible(), true);
  assert.equal(await page.locator("#focus-task-preview-title").textContent(), "季度汇报");

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);
  await settle();
  await startFocus();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.screenshot({ path: path.join(dataDirectory, "focus-overlay-dark.png"), fullPage: true });
  await finishByShortcut();
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);
  await settle();

  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `专注钟设置页水平溢出 ${width}`);
    await startFocus();
    const box = await overlay.boundingBox();
    assert.ok(box && Math.abs(box.width - width) <= 1, `专注界面覆盖视口 ${width}`);
    const metrics = await page.evaluate(() => {
      const content = document.querySelector("#focus-overlay-content").getBoundingClientRect();
      const actions = [...document.querySelectorAll(".focus-overlay-actions button")].map(node => node.getBoundingClientRect());
      return { contentLeft: content.left, contentRight: content.right, actionsInside: actions.every(rect => rect.left >= 0 && rect.right <= innerWidth), overflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(metrics.overflow, true, `专注界面水平溢出 ${width}`);
    assert.ok(metrics.contentLeft >= 0 && metrics.contentRight <= width, `专注内容不应越界 ${width}`);
    assert.equal(metrics.actionsInside, true, `专注操作按钮不应越界 ${width}`);
    if (width === 375) {
      await hideToast();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(dataDirectory, "focus-mobile.png"), fullPage: true });
    }
    await finishByShortcut();
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "focus timer passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
