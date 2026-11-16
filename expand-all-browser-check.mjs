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
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "expand-all-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const toggle = page.locator("#toggle-cards");
  const doneToggle = page.locator("#toggle-completed-cards");
  const navDone = page.locator('#system-groups [data-group-id="done"]');
  const cache = () => page.evaluate(() => JSON.parse(localStorage.getItem("yijian.workspace.v2")));
  const hideToast = () => page.evaluate(() => document.querySelector("#toast").classList.remove("visible"));
  const settle = async () => { await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 }); await page.waitForTimeout(700); };
  const add = async (title, { urgent = false } = {}) => {
    await page.locator("#task-heading").fill(title);
    await page.locator("#task-input").fill("用于检查一键展开和折叠的全部卡片状态，内容需要足够长才能形成预览。");
    if (urgent) await page.locator("#task-priority").selectOption("urgent");
    await page.locator(".add-button").click();
    await page.waitForTimeout(360);
  };
  const card = (root, text) => page.locator(`${root} .task-card`).filter({ hasText: text });
  const visibleCards = () => page.evaluate(() => [...document.querySelectorAll("#task-list .task-card, #completed-list .task-card, #pinned-list .task-card, #urgent-list .task-card")]
    .filter(node => node.getClientRects().length > 0)
    .map(node => ({ id: node.dataset.id, area: node.dataset.area, collapsed: node.classList.contains("is-collapsed") })));
  const buttonInfo = async locator => locator.evaluate(node => ({
    hidden: node.hidden, disabled: node.disabled, label: node.querySelector("span").textContent,
    action: node.dataset.action, aria: node.getAttribute("aria-label"), title: node.title
  }));
  const assertAllCollapsed = async (expected, message) => {
    const cards = await visibleCards();
    assert.ok(cards.length > 0, "应存在可见卡片");
    assert.ok(cards.every(item => item.collapsed === expected), message);
    const tasks = (await cache()).tasks;
    const ids = new Set(cards.map(item => item.id));
    assert.ok(tasks.filter(task => ids.has(task.id)).every(task => task.collapsed === expected), `${message}：浏览器保存同步`);
  };

  await page.goto(base);
  await openTodo(page);
  await settle();
  assert.equal(await toggle.isVisible(), false, "没有卡片时不展示一键折叠");
  assert.equal(await doneToggle.isVisible(), false, "没有已完成卡片时不展示汇总页按钮");

  await add("卡片一", { urgent: true });
  await add("卡片二");
  await add("卡片三");
  await card("#task-list", "卡片二").locator(".pin-button").click();
  await page.waitForTimeout(650);
  await hideToast();
  const initial = await buttonInfo(toggle);
  assert.equal(initial.hidden, false);
  assert.equal(initial.label, "全部折叠");
  assert.equal(initial.action, "collapse");
  assert.equal(initial.aria, "折叠全部卡片");
  assert.match(initial.title, /一键折叠当前页的所有卡片/);
  assert.equal((await visibleCards()).length, 5, "待办、紧迫与置顶卡片都应纳入");

  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(true, "一键折叠覆盖当前页全部卡片");
  const collapsedButton = await buttonInfo(toggle);
  assert.equal(collapsedButton.label, "全部展开");
  assert.equal(collapsedButton.action, "expand");
  assert.equal(collapsedButton.aria, "展开全部卡片");
  assert.equal(await page.locator("#toast").textContent(), "已折叠全部卡片");
  assert.equal(await card("#task-list", "卡片一").locator(".move-select").isVisible(), false);
  assert.equal(await card("#pinned-list", "卡片二").locator(".move-select").isVisible(), false);
  await hideToast();
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(dataDirectory, "expand-all-collapsed.png"), fullPage: true });

  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(false, "一键展开覆盖当前页全部卡片");
  assert.equal(await page.locator("#toast").textContent(), "已展开全部卡片");
  assert.equal((await buttonInfo(toggle)).label, "全部折叠");
  assert.equal(await card("#task-list", "卡片一").locator(".move-select").isVisible(), true);

  await card("#task-list", "卡片一").locator(".fold-button").click();
  await page.waitForTimeout(350);
  assert.equal((await buttonInfo(toggle)).label, "全部折叠", "混合状态优先提供全部折叠");
  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(true, "混合状态点击后全部折叠");
  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(false, "再次点击恢复全部展开");
  await hideToast();

  await page.locator('#system-groups [data-group-id="ungrouped"]').click();
  await settle();
  await card("#task-list", "卡片三").locator(".complete-button").click();
  await page.waitForFunction(() => !document.querySelector("#completed-list .task-card.is-landing"), null, { timeout: 3000 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#completed-section").isVisible(), true);
  assert.equal(await card("#completed-list", "卡片三").evaluate(node => node.getClientRects().length > 0), true);
  assert.equal((await buttonInfo(toggle)).label, "全部折叠");
  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(true, "分组内的已完成卡片一并折叠");
  assert.equal(await card("#completed-list", "卡片三").evaluate(node => node.classList.contains("is-collapsed")), true);
  await hideToast();
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(dataDirectory, "expand-all-group.png"), fullPage: true });
  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(false, "分组内全部展开");

  await navDone.click();
  await settle();
  assert.equal(await page.locator("#list-toolbar").isVisible(), false, "汇总页沿用简洁布局");
  assert.equal(await toggle.isVisible(), false);
  assert.equal(await doneToggle.isVisible(), true, "汇总页提供标题旁的一键按钮");
  assert.equal((await buttonInfo(toggle)).label, (await buttonInfo(doneToggle)).label, "两个入口状态同步");
  assert.equal((await buttonInfo(doneToggle)).label, "全部折叠");
  await doneToggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(true, "汇总页一键折叠全部可见卡片");
  assert.equal((await buttonInfo(doneToggle)).label, "全部展开");
  assert.equal(await card("#completed-list", "卡片三").evaluate(node => node.classList.contains("is-collapsed")), true);
  await hideToast();
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(dataDirectory, "expand-all-done.png"), fullPage: true });
  await doneToggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(false, "汇总页一键展开");

  await doneToggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(true, "为刷新持久化再次折叠");
  await hideToast();
  await page.reload();
  await openTodo(page);
  await settle();
  assert.equal((await buttonInfo(toggle)).label, "全部展开", "刷新后保留折叠状态");
  await assertAllCollapsed(true, "刷新后卡片仍折叠");
  await toggle.click();
  await page.waitForTimeout(450);
  await assertAllCollapsed(false, "刷新后仍可一键展开");

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(450);
  const dark = await toggle.evaluate(node => ({ color: getComputedStyle(node).color, bg: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderColor }));
  assert.match(dark.bg, /rgba?\(/, "深色按钮保留玻璃底");
  assert.equal(await toggle.isVisible(), true, "深色模式一键按钮仍可见");
  await hideToast();
  await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(dataDirectory, "expand-all-dark.png"), fullPage: true });
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);

  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(450);
    const metrics = await toggle.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const toolbar = document.querySelector("#list-toolbar").getBoundingClientRect();
      return { x: rect.x, right: rect.right, width: rect.width, height: rect.height, toolbarX: toolbar.x, toolbarRight: toolbar.right, overflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(metrics.overflow, true, `一键按钮不造成横向溢出 ${width}`);
    assert.ok(metrics.x >= metrics.toolbarX - 1 && metrics.right <= metrics.toolbarRight + 1, `一键按钮收在工具栏内 ${width}`);
    assert.ok(metrics.height >= 24, `一键按钮在 ${width} 下仍可点击`);
    await toggle.click();
    await page.waitForTimeout(400);
    await assertAllCollapsed(true, `窄屏 ${width} 可一键折叠`);
    await toggle.click();
    await page.waitForTimeout(400);
    await assertAllCollapsed(false, `窄屏 ${width} 可一键展开`);
    if (width === 375) {
      await toggle.click();
      await page.waitForTimeout(400);
      await hideToast();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(dataDirectory, "expand-all-mobile.png"), fullPage: true });
      await toggle.click();
      await page.waitForTimeout(400);
    }
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(350);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "expand all passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
