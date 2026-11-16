import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";
import { openTodo } from "./test-browser-helpers.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "masonry-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const BASE_TIME = Date.UTC(2026, 10, 1);
const seed = {
  version: 2,
  modifiedAt: BASE_TIME,
  groups: [],
  dailyTasks: [],
  tasks: Array.from({ length: 16 }, (_, i) => ({
    id: `masonry-seed-${String(i).padStart(2, "0")}`,
    title: `待办 ${i}`,
    content: `第 ${i} 件待办的正文，用来检查瀑布流卡片。`.repeat(i % 3 + 1),
    collapsed: i === 4,
    dueDate: null,
    priority: [2, 7, 11].includes(i) ? "urgent" : "normal",
    homework: false,
    longTerm: false,
    createdAt: BASE_TIME + i * 60000,
    pinnedAt: i === 6 ? BASE_TIME : 0,
    groupId: null
  }))
};
const expectedOrder = ["masonry-seed-11", "masonry-seed-07", "masonry-seed-02", ...[15, 14, 13, 12, 10, 9, 8, 6, 5, 4, 3, 1, 0].map(i => `masonry-seed-${String(i).padStart(2, "0")}`)];
const boxes = page => page.locator("#task-list .task-card").evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { id: card.dataset.id, x: r.x, y: r.y, width: r.width, height: r.height }; }));
async function assertNoOverlap(page, label) {
  const rects = await boxes(page);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    assert.ok(overlapX <= 0.5 || overlapY <= 0.5, `${label} 卡片重叠 ${JSON.stringify([a, b])}`);
  }
  return rects;
}
async function assertExpandedContent(page, label) {
  const cards = await page.locator("#task-list .task-card:not(.is-collapsed)").evaluateAll(nodes => nodes.map(node => {
    const content = node.querySelector(".task-content");
    const title = node.querySelector(".task-title");
    const select = node.querySelector(".move-select");
    const card = node.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    const s = select.getBoundingClientRect();
    return { id: node.dataset.id, contentH: +c.height.toFixed(1), titleH: +t.height.toFixed(1), titleInside: t.height > 5 && t.top >= c.top - .5 && t.bottom <= c.bottom + .5, selectInside: select.hidden || (s.top >= card.top && s.bottom <= card.bottom - 2) };
  }));
  assert.ok(cards.length > 0, `${label} 应有展开卡片`);
  assert.ok(cards.every(item => item.titleInside), `${label} 展开卡片标题应完整可见 ${JSON.stringify(cards.filter(item => !item.titleInside))}`);
  assert.ok(cards.every(item => item.selectInside), `${label} 分组菜单应收在卡片内`);
}
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Shanghai" });
  await context.addInitScript(state => localStorage.setItem("yijian.workspace.v2", JSON.stringify(state)), seed);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-11-11T12:00:00+08:00") });
  await page.clock.pauseAt(new Date("2026-11-11T12:00:01+08:00"));
  await page.goto(base);
  await openTodo(page);
  await page.waitForFunction(() => document.querySelectorAll("#task-list .task-card").length === 16);
  assert.deepEqual(await page.locator("#task-list .task-card").evaluateAll(cards => cards.map(card => card.dataset.id)), expectedOrder, "紧迫待办应排在一般优先级之前");
  assert.equal(await page.locator("#task-list .is-urgent").count(), 3);
  const firstScreen = await page.locator("#task-list .task-card").evaluateAll(cards => cards.filter(card => { const r = card.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).map(card => ({ pending: card.classList.contains("reveal-pending"), filter: getComputedStyle(card).filter })));
  assert.ok(firstScreen.length >= 1 && firstScreen.every(card => !card.pending && card.filter === "none"), `首屏卡片应直接清晰，模糊仅在向下滚动从底部进入时触发 ${JSON.stringify(firstScreen)}`);
  assert.match(await page.locator("#task-list .task-card").first().evaluate(card => getComputedStyle(card).backdropFilter), /blur\(26px\)/, "卡片应有更重的液态玻璃背景模糊");
  await page.waitForFunction(() => [...document.querySelectorAll("#task-list .task-card")].filter(card => card.getBoundingClientRect().bottom < innerHeight - 60).every(card => card.classList.contains("is-revealed")));
  await page.waitForTimeout(1300);
  const rects = await assertNoOverlap(page, "初始");
  const heights = await page.locator("#task-list .task-card:not(.is-collapsed)").evaluateAll(cards => cards.map(card => card.offsetHeight));
  assert.ok(new Set(heights).size >= 3, `卡片高度应随机错落：${JSON.stringify(heights)}`);
  await assertExpandedContent(page, "初始 1440");
  assert.ok(new Set(rects.map(r => Math.round(r.y))).size >= 3, "瀑布流应有多层错落位置");
  assert.ok(rects.every(r => r.width >= 190 && r.width <= 280), `列宽异常 ${JSON.stringify(rects.map(r => r.width))}`);
  const side = await page.locator("#pinned-list .task-card").evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
  assert.ok(side.every(r => Math.abs(r.width - r.height) < 2), "置顶卡片保持正方形");
  const pending = await page.locator("#task-list .reveal-pending").evaluateAll(cards => cards.map(card => ({ top: card.getBoundingClientRect().top, vh: innerHeight, filter: getComputedStyle(card).filter, opacity: getComputedStyle(card).opacity })));
  assert.ok(pending.length >= 1, "首屏之下应有待展开的模糊卡片");
  assert.ok(pending.every(card => card.top > card.vh - 40 && card.filter === "blur(16px)" && card.opacity === "0.25"), `模糊初始状态 ${JSON.stringify(pending)}`);
  await page.screenshot({ path: path.join(dataDirectory, "masonry-top.png") });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => [...document.querySelectorAll("#task-list .task-card")].some(card => { const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(card).filter); return m && Number(m[1]) > 0.5 && Number(m[1]) < 15.5; }), null, { timeout: 3000 });
  await page.waitForFunction(() => [...document.querySelectorAll("#task-list .task-card")].filter(card => { const r = card.getBoundingClientRect(); return r.top < innerHeight - 60 && r.bottom > 60; }).every(card => card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"), null, { timeout: 4000 });
  await assertNoOverlap(page, "滚动后");
  await page.screenshot({ path: path.join(dataDirectory, "masonry-bottom.png") });
  const seenAtBottom = await page.locator("#task-list .task-card").evaluateAll(cards => cards.filter(card => {
    const r = card.getBoundingClientRect();
    return r.top > 100 && r.bottom < innerHeight - 60 && card.classList.contains("is-revealed");
  }).map(card => card.dataset.id));
  assert.ok(seenAtBottom.length >= 1, "滚到底部后应有完整可见且已展开的卡片");
  const above = await page.evaluate(() => {
    const pending = [...document.querySelectorAll("#task-list .reveal-pending")].filter(card => card.getBoundingClientRect().bottom < 0);
    const card = pending[pending.length - 1];
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { id: card.dataset.id, targetY: Math.max(0, Math.round(r.top + scrollY + r.height - 90)) };
  });
  assert.ok(above, "跳到底部后，上方应仍有未看过的模糊卡片");
  await page.evaluate(y => window.scrollTo(0, y), above.targetY);
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"; }, above.id, { timeout: 400 });
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = totalHeight; y > 0; y -= 500) {
    await page.evaluate(top => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const repeatId = seenAtBottom[0];
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("reveal-pending"); }, repeatId, { timeout: 3000 });
  await page.waitForTimeout(250);
  const rearmed = await page.locator("#task-list .reveal-pending").evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(); return { top: r.top, vh: innerHeight, filter: getComputedStyle(card).filter, opacity: getComputedStyle(card).opacity }; }));
  assert.ok(rearmed.length >= 1, "回到顶部后，之前看过的下方卡片应重新等待展开");
  assert.ok(rearmed.every(card => card.top >= card.vh - 1 && card.filter === "blur(16px)" && card.opacity === "0.25"), `重新待展开状态 ${JSON.stringify(rearmed)}`);
  const topVisible = await page.locator("#task-list .task-card").evaluateAll(cards => cards.filter(card => { const r = card.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).map(card => ({ pending: card.classList.contains("reveal-pending"), filter: getComputedStyle(card).filter })));
  assert.ok(topVisible.length >= 1 && topVisible.every(card => !card.pending && card.filter === "none"), `顶部可见卡片应保持清晰 ${JSON.stringify(topVisible)}`);
  await assertNoOverlap(page, "回到顶部后");

  const repeatCard = page.locator(`#task-list .task-card[data-id="${repeatId}"]`);
  const repeatTargetY = await repeatCard.evaluate(card => { const r = card.getBoundingClientRect(); return Math.max(0, Math.round(r.top + scrollY - innerHeight * .55)); });
  await page.evaluate(y => window.scrollTo(0, y), repeatTargetY);
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(card).filter); return m && Number(m[1]) > 0.5 && Number(m[1]) < 15.5; }, repeatId, { timeout: 3000 });
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"; }, repeatId, { timeout: 4000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("reveal-pending"); }, repeatId, { timeout: 3000 });
  await page.evaluate(y => window.scrollTo(0, y), repeatTargetY);
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(card).filter); return m && Number(m[1]) > 0.5 && Number(m[1]) < 15.5; }, repeatId, { timeout: 3000 });
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"; }, repeatId, { timeout: 4000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await assertNoOverlap(page, "重复展开后");
  const first = page.locator("#task-list .task-card").first();
  const expandedHeight = await first.evaluate(card => card.offsetHeight);
  await first.locator(".fold-button").click();
  await page.waitForTimeout(400);
  assert.equal(await first.evaluate(card => card.classList.contains("is-collapsed")), true);
  assert.ok(await first.evaluate(card => card.offsetHeight) < expandedHeight, "折叠后卡片应变矮");
  assert.equal(await page.locator("#task-list .task-card").evaluateAll(cards => cards.filter(card => { const r = card.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).every(card => !card.classList.contains("reveal-pending") && getComputedStyle(card).filter === "none")), true, "重渲染不应让当前可见卡片重新模糊");
  assert.ok(await page.locator("#task-list .reveal-pending").count() >= 1, "下方的卡片应继续等待再次从底部展开");
  await assertNoOverlap(page, "折叠后");
  await first.locator(".fold-button").click();
  await page.locator("#task-heading").fill("新增的瀑布流待办");
  await page.locator("#task-input").fill("新卡片也应参与瀑布流并展开。");
  await page.locator(".add-button").click();
  await page.waitForFunction(() => document.querySelectorAll("#task-list .task-card").length === 17);
  const newCard = page.locator("#task-list .task-card").filter({ hasText: "新增的瀑布流待办" });
  await newCard.scrollIntoViewIfNeeded();
  const newId = await newCard.getAttribute("data-id");
  await page.waitForFunction(id => { const card = document.querySelector(`#task-list .task-card[data-id="${id}"]`); return card && card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"; }, newId, { timeout: 4000 });
  await page.waitForFunction(() => [...document.querySelectorAll("#task-list .task-card")].filter(card => { const r = card.getBoundingClientRect(); return r.top < innerHeight - 60 && r.bottom > 60; }).every(card => card.classList.contains("is-revealed") && getComputedStyle(card).filter === "none"), null, { timeout: 4000 });
  await assertNoOverlap(page, "新增后");
  for (const width of [1200, 960, 700, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `水平溢出：${width}`);
    const current = await assertNoOverlap(page, `宽度 ${width}`);
    await assertExpandedContent(page, `宽度 ${width}`);
    if (width <= 960) {
      const columns = await page.locator("#task-list .task-card").evaluateAll(cards => [...new Set(cards.map(card => Math.round(card.offsetLeft)))]);
      assert.equal(columns.length, 1, `窄屏应为单列 ${width}：${JSON.stringify(columns)}`);
      assert.ok(new Set(current.map(r => Math.round(r.height))).size >= 3, `窄屏高度仍应错落 ${width}`);
    }
    if (width === 375) await page.screenshot({ path: path.join(dataDirectory, "masonry-mobile.png"), fullPage: true });
  }
  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await reducedContext.addInitScript(state => localStorage.setItem("yijian.workspace.v2", JSON.stringify(state)), seed);
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(base);
  await openTodo(reducedPage);
  await reducedPage.waitForFunction(() => document.querySelectorAll("#task-list .task-card").length === 16);
  assert.equal(await reducedPage.locator("#task-list .reveal-pending").count(), 0, "减少动态效果时不应出现模糊待展开状态");
  assert.ok(await reducedPage.locator("#task-list .task-card").evaluateAll(cards => cards.every(card => getComputedStyle(card).filter === "none")));
  await assertNoOverlap(reducedPage, "减少动态效果");
  assert.deepEqual(errors, []);
  console.log("PASS: 瀑布流随机大小错落不重叠、紧迫前置、每次从画面下方进入时高斯模糊由强到弱展开、从顶部进入直接清晰、重渲染不模糊当前可见卡片、折叠/新增/320–1440px 布局、液态玻璃背景模糊、减少动态效果降级。");
  console.log(`Screenshots: ${dataDirectory}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}