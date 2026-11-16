import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "review-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const now = new Date("2026-11-12T12:00:00+08:00");
const DAY = 86400000;
const seed = {
  version: 2,
  modifiedAt: now.getTime(),
  groups: [{ id: "group-math", name: "高等数学" }],
  dailyTasks: [],
  tasks: [
    { id: "review-day0", title: "今天完成", content: "今天完成的任务，还没有到复习时间。", completed: true, completedAt: now.getTime(), reviews: [0, 0, 0, 0], groupId: "group-math", createdAt: now.getTime() - 10 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-day1", title: "昨天的任务", content: "昨天完成，今天应做第 1 天复习。", completed: true, completedAt: now.getTime() - DAY, reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - 10 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-day3", title: "第三天的任务", content: "已完成第 1 天复习，今天应做第 3 天复习。", completed: true, completedAt: now.getTime() - 3 * DAY, reviews: [now.getTime() - 2 * DAY, 0, 0, 0], groupId: "group-math", createdAt: now.getTime() - 12 * DAY, collapsed: false, dueDate: null, priority: "urgent", homework: true, longTerm: false, pinnedAt: 0 },
    { id: "review-day7", title: "第七天的任务", content: "已完成 1、3 天复习，今天应做第 7 天复习。", completed: true, completedAt: now.getTime() - 7 * DAY, reviews: [now.getTime() - 6 * DAY, now.getTime() - 4 * DAY, 0, 0], groupId: null, createdAt: now.getTime() - 15 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-day15", title: "第十五天的任务", content: "已完成前三次，今天应做第 15 天复习。", completed: true, completedAt: now.getTime() - 15 * DAY, reviews: [now.getTime() - 14 * DAY, now.getTime() - 12 * DAY, now.getTime() - 8 * DAY, 0], groupId: "group-math", createdAt: now.getTime() - 20 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-day20", title: "逾期未复习", content: "完成 20 天，四个复习节点都没有打卡。", completed: true, completedAt: now.getTime() - 20 * DAY, reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - 30 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-done", title: "已经复习完", content: "四次复习都完成了，不应参与记忆或出现在列表。", completed: true, completedAt: now.getTime() - 16 * DAY, reviews: [now.getTime() - 15 * DAY, now.getTime() - 13 * DAY, now.getTime() - 9 * DAY, now.getTime() - DAY], groupId: null, createdAt: now.getTime() - 20 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 },
    { id: "review-active", title: "普通未完成", content: "还没有完成，不应参与。", completed: false, completedAt: 0, reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - 2 * DAY, collapsed: false, dueDate: null, priority: "normal", homework: false, longTerm: false, pinnedAt: 0 }
  ]
};
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: "Asia/Shanghai" });
  await context.addInitScript(state => localStorage.setItem("yijian.workspace.v2", JSON.stringify(state)), seed);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: now });
  const reviewCard = title => page.locator("#review-due-list .review-card").filter({ hasText: title });
  const dueTitles = () => page.locator("#review-due-list .review-card-title").allTextContents();
  const checks = card => card.locator(".review-check").evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, cls: node.className, disabled: node.disabled, pressed: node.getAttribute("aria-pressed") })));
  const schedule = () => page.locator("#review-chart .review-point").evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.id, cx: Number(node.getAttribute("cx")), cy: Number(node.getAttribute("cy")), due: node.classList.contains("is-due"), title: node.querySelector("title")?.textContent })));
  const settle = async () => { await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 }); await page.waitForTimeout(700); };
  const hideToast = () => page.evaluate(() => document.querySelector("#toast").classList.remove("visible"));
  const stats = async () => ({
    active: await page.locator("#review-active-count").textContent(),
    due: await page.locator("#review-due-count").textContent(),
    cycles: await page.locator("#review-complete-count").textContent()
  });
  const stateTask = id => page.evaluate(taskId => JSON.parse(localStorage.getItem("yijian.workspace.v2")).tasks.find(task => task.id === taskId), id);

  await page.goto(base);
  assert.equal(await page.locator("#workspace-switcher .workspace-button").count(), 4);
  await page.locator('#workspace-switcher [data-workspace="review"]').click();
  await page.locator("#review-view").waitFor({ state: "visible" });
  const chartAnimation = await page.evaluate(() => {
    const path = document.querySelector("#review-chart .review-curve-path");
    return {
      path: path?.getAnimations().map(animation => ({ duration: animation.effect.getTiming().duration, delay: animation.effect.getTiming().delay })) || [],
      points: [...document.querySelectorAll("#review-chart .review-point")].filter(node => node.getAnimations().length > 0).length,
      frame: document.querySelector("#review-chart .review-chart-frame")?.getAnimations().length || 0,
      area: document.querySelector("#review-chart .review-curve-area")?.getAnimations().length || 0,
      dash: path?.style.strokeDasharray || ""
    };
  });
  assert.ok(chartAnimation.path.length >= 1, "曲线加载时应有绘制动画");
  assert.ok(chartAnimation.path[0].duration >= 700, "曲线绘制动画应有足够时长");
  assert.ok(chartAnimation.path[0].delay > 0, "曲线绘制动画应在工作区入场后开始");
  assert.ok(chartAnimation.frame >= 1 && chartAnimation.area >= 1, "坐标框与曲线面积同步渐显");
  assert.ok(chartAnimation.points >= 1, "曲线任务点应依次出现");
  assert.ok(chartAnimation.dash, "曲线绘制使用虚线偏移动画");
  await settle();
  assert.equal(await page.locator('#workspace-switcher [data-workspace="review"]').getAttribute("aria-current"), "page");
  assert.equal(await page.locator('#workspace-switcher [data-workspace="calendar"]').getAttribute("aria-current"), "false");
  assert.equal(await page.locator("#breadcrumb-current").textContent(), "艾宾浩斯");
  assert.match(await page.title(), /艾宾浩斯/);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.deepEqual(await stats(), { active: "6", due: "5", cycles: "1" });
  assert.equal(await page.locator("#review-due-badge").textContent(), "5");
  assert.equal(await page.locator("#review-chart svg").count(), 1);
  assert.equal(await page.locator("#review-chart .review-curve-path").count(), 1);
  assert.ok((await page.locator("#review-chart .review-curve-path").getAttribute("d")).startsWith("M"));
  const axisLabels = await page.locator("#review-chart .review-axis-label").allTextContents();
  for (const label of ["0%", "50%", "100%", "0", "1", "3", "7", "15", "20天"]) assert.ok(axisLabels.includes(label), `缺少坐标标签 ${label}`);
  assert.deepEqual(await page.locator("#review-chart .review-review-label").allTextContents(), ["1天", "3天", "7天", "15天"]);
  assert.match(await page.locator("#review-chart svg").getAttribute("aria-label"), /6 件待办参与记忆，5 件今日待复习/);
  const points = await schedule();
  assert.equal(points.length, 6);
  assert.deepEqual(points.map(item => item.id), ["review-day0", "review-day1", "review-day3", "review-day7", "review-day15", "review-day20"]);
  assert.ok(points.every((item, index) => index === 0 || (item.cx > points[index - 1].cx && item.cy > points[index - 1].cy)), "曲线点应按天数向右下分布");
  assert.equal(points.filter(item => item.due).length, 5);
  assert.equal(points.find(item => item.id === "review-day0").due, false);
  assert.match(points.find(item => item.id === "review-day20").title, /完成 20 天 · 已复习 0\/4/);
  assert.ok(await page.locator("#review-chart .review-point-label").count() >= 1, "曲线应显示任务标签");
  const labelStyle = await page.locator("#review-chart .review-point-label").first().evaluate(node => { const s = getComputedStyle(node); return { size: s.fontSize, family: s.fontFamily, stroke: s.stroke, strokeWidth: s.strokeWidth }; });
  assert.equal(labelStyle.size, "11px", "曲线任务标签字体不应过小");
  assert.match(labelStyle.family, /Microsoft YaHei/, "曲线文字使用应用中文字体");
  assert.notEqual(labelStyle.stroke, "none", "曲线标签带描边光晕");
  assert.equal(labelStyle.strokeWidth, "3px");
  const labelOverlap = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("#review-chart .review-point-label")].map(node => node.getBoundingClientRect());
    const points = [...document.querySelectorAll("#review-chart .review-point")].map(node => node.getBoundingClientRect());
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    return { labels: labels.some((a, index) => labels.some((b, other) => index < other && overlap(a, b))), points: labels.some(a => points.some(b => overlap(a, b))) };
  });
  assert.equal(labelOverlap.labels, false, "曲线标签不应互相重叠");
  assert.equal(labelOverlap.points, false, "曲线标签不应压住圆点");
  assert.equal(await page.locator("#review-due-list .review-card").count(), 5);
  assert.deepEqual(await dueTitles(), ["逾期未复习", "第十五天的任务", "第七天的任务", "第三天的任务", "昨天的任务"]);
  assert.deepEqual((await checks(reviewCard("昨天的任务"))).map(item => item.cls), ["review-check is-due", "review-check is-locked", "review-check is-locked", "review-check is-locked"]);
  assert.deepEqual((await checks(reviewCard("第三天的任务"))).map(item => item.cls), ["review-check is-done", "review-check is-due", "review-check is-locked", "review-check is-locked"]);
  assert.deepEqual((await checks(reviewCard("第七天的任务"))).map(item => item.cls), ["review-check is-done", "review-check is-done", "review-check is-due", "review-check is-locked"]);
  assert.deepEqual((await checks(reviewCard("第十五天的任务"))).map(item => item.cls), ["review-check is-done", "review-check is-done", "review-check is-done", "review-check is-due"]);
  assert.deepEqual((await checks(reviewCard("逾期未复习"))).map(item => item.cls), ["review-check is-due", "review-check is-due", "review-check is-due", "review-check is-due"]);
  assert.equal(await reviewCard("昨天的任务").locator(".review-card-days").textContent(), "已完成 1 天");
  assert.equal(await reviewCard("逾期未复习").locator(".review-progress span").last().textContent(), "今日应打卡：1天、3天、7天、15天");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#review-chart .review-point").first().focus();
  assert.equal(await page.locator("#review-chart .review-point").first().evaluate(node => node === document.activeElement), true, "曲线点可键盘聚焦");
  await hideToast();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dataDirectory, "review-desktop.png"), fullPage: true });
  await page.locator("#save-button").click();
  await page.waitForFunction(() => document.querySelector("#save-status").textContent === "已保存到本地", null, { timeout: 5000 });

  await reviewCard("第十五天的任务").locator(".review-check").nth(3).click();
  await page.waitForTimeout(450);
  assert.equal(await reviewCard("第十五天的任务").count(), 0);
  assert.deepEqual(await stats(), { active: "5", due: "4", cycles: "2" });
  assert.equal(await page.locator("#toast").textContent(), "艾宾浩斯复习完成，已移出复习列表");
  assert.equal((await stateTask("review-day15")).reviews.every(Boolean), true);
  assert.equal((await schedule()).length, 5);

  await reviewCard("昨天的任务").locator(".review-check").first().click();
  await page.waitForTimeout(450);
  assert.equal(await reviewCard("昨天的任务").count(), 0);
  assert.deepEqual(await stats(), { active: "5", due: "3", cycles: "2" });
  const day1Task = await stateTask("review-day1");
  assert.ok(day1Task.reviews[0] > 0 && day1Task.reviews.slice(1).every(value => value === 0));
  assert.equal((await schedule()).find(item => item.id === "review-day1").due, false);

  const overdue = reviewCard("逾期未复习");
  await overdue.locator(".review-check").first().click();
  await page.waitForTimeout(400);
  assert.equal(await reviewCard("逾期未复习").count(), 1, "还有未打卡节点时卡片保留");
  assert.equal(await reviewCard("逾期未复习").locator(".review-progress strong").textContent(), "1/4");
  assert.deepEqual((await checks(reviewCard("逾期未复习"))).map(item => item.cls), ["review-check is-done", "review-check is-due", "review-check is-due", "review-check is-due"]);
  assert.equal(await page.locator("#toast").textContent(), "已完成「1天」复习打卡");
  for (let index = 0; index < 3; index++) {
    await reviewCard("逾期未复习").locator(".review-check.is-due:not(:disabled)").first().click();
    await page.waitForTimeout(350);
  }
  assert.equal(await reviewCard("逾期未复习").count(), 0);
  assert.deepEqual(await stats(), { active: "4", due: "2", cycles: "3" });
  assert.equal((await stateTask("review-day20")).reviews.every(Boolean), true);
  assert.equal((await schedule()).length, 4);
  assert.equal(await page.locator("#toast").textContent(), "艾宾浩斯复习完成，已移出复习列表");

  await page.locator("#save-status").hover();
  assert.match(await page.locator("#save-changes-list").textContent(), /艾宾浩斯复习打卡/);
  await page.locator("#save-button").click();
  await page.waitForFunction(() => document.querySelector("#save-status").textContent === "已保存到本地", null, { timeout: 5000 });
  const manifest = JSON.parse(await readFile(path.join(dataDirectory, ".todo-workspace.json"), "utf8"));
  const manifestDay15 = manifest.state.tasks.find(task => task.id === "review-day15");
  const manifestDay20 = manifest.state.tasks.find(task => task.id === "review-day20");
  assert.equal(manifestDay15.reviews.every(Boolean), true);
  assert.equal(manifestDay20.reviews.every(Boolean), true);
  const taskFile = JSON.parse(await readFile(path.join(dataDirectory, "高等数学", "review-day15.todo.json"), "utf8"));
  assert.deepEqual(taskFile.task.reviews, manifestDay15.reviews);

  await page.locator('#workspace-switcher [data-workspace="todo"]').click();
  await settle();
  await page.locator('#system-groups [data-group-id="done"]').click();
  await settle();
  await page.locator('#completed-list .task-card').filter({ hasText: "昨天的任务" }).locator(".complete-button").click();
  await page.waitForFunction(id => !document.querySelector(`#completed-list [data-id="${id}"]`), "review-day1");
  const resetDay1 = await stateTask("review-day1");
  assert.equal(resetDay1.completed, false);
  assert.deepEqual(resetDay1.reviews, [0, 0, 0, 0]);
  await page.locator('#workspace-switcher [data-workspace="review"]').click();
  await settle();
  assert.deepEqual(await stats(), { active: "3", due: "2", cycles: "3" });
  assert.deepEqual(await dueTitles(), ["第七天的任务", "第三天的任务"]);
  assert.equal((await schedule()).length, 3);
  assert.equal((await schedule()).some(item => item.id === "review-day1"), false);

  await reviewCard("第七天的任务").locator(".review-check").nth(2).click();
  await page.waitForTimeout(400);
  await reviewCard("第三天的任务").locator(".review-check").nth(1).click();
  await page.waitForTimeout(500);
  assert.deepEqual(await stats(), { active: "3", due: "0", cycles: "3" });
  assert.equal(await page.locator("#review-due-list").isVisible(), false);
  assert.equal(await page.locator("#review-empty").isVisible(), true);
  assert.equal(await page.locator("#review-empty-title").textContent(), "今天没有需要复习的待办");
  assert.match(await page.locator("#review-empty-description").textContent(), /下一次复习在 1 天后。还有 3 件待办在记忆周期中/);
  assert.equal((await schedule()).length, 3);

  await page.clock.setSystemTime(new Date(now.getTime() + 2 * DAY));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(600);
  assert.deepEqual(await stats(), { active: "3", due: "1", cycles: "3" });
  assert.deepEqual(await dueTitles(), ["今天完成"]);
  assert.equal(await reviewCard("今天完成").locator(".review-card-days").textContent(), "已完成 2 天");
  assert.deepEqual((await checks(reviewCard("今天完成"))).map(item => item.cls), ["review-check is-due", "review-check is-locked", "review-check is-locked", "review-check is-locked"]);
  assert.equal((await schedule()).length, 3);
  assert.ok(!(await page.locator("#review-chart .review-axis-label").allTextContents()).includes("20天"));

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);
  await settle();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  const darkPanel = await page.locator(".review-chart-panel").evaluate(node => getComputedStyle(node).backgroundColor);
  assert.match(darkPanel, /rgba?\(/, "深色记忆面板保留玻璃底");
  await hideToast();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dataDirectory, "review-dark.png"), fullPage: true });
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(350);
  await settle();

  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `艾宾浩斯页面水平溢出 ${width}`);
    const layout = await page.evaluate(() => {
      const stats = document.querySelector(".review-stats");
      const chart = document.querySelector("#review-chart");
      const card = document.querySelector("#review-due-list .review-card");
      const buttons = card ? [...card.querySelectorAll(".review-check")].map(node => node.getBoundingClientRect()) : [];
      return {
        statsColumns: getComputedStyle(stats).gridTemplateColumns.split(" ").length,
        chartWidth: chart.getBoundingClientRect().width,
        chartRight: chart.getBoundingClientRect().right,
        cardRight: card?.getBoundingClientRect().right ?? 0,
        buttonsInside: buttons.every(rect => rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth)
      };
    });
    assert.ok(layout.statsColumns === 3 || width > 700, `窄屏统计卡应三列 ${width}`);
    assert.ok(layout.chartWidth > 0 && layout.chartRight <= width, `曲线不应越界 ${width}`);
    assert.ok(layout.cardRight <= width, `复习卡片不应越界 ${width}`);
    assert.equal(layout.buttonsInside, true, `打卡按钮不应越界 ${width}`);
    if (width === 375) {
      await hideToast();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(dataDirectory, "review-mobile.png"), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(400);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator('#workspace-switcher [data-workspace="calendar"]').click();
  await settle();
  await page.locator('#workspace-switcher [data-workspace="review"]').click();
  await page.locator("#review-view").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const reducedChartAnimations = await page.evaluate(() => {
    const path = document.querySelector("#review-chart .review-curve-path");
    return {
      path: path?.getAnimations().length || 0,
      points: [...document.querySelectorAll("#review-chart .review-point")].filter(node => node.getAnimations().length > 0).length,
      dash: path?.style.strokeDasharray || ""
    };
  });
  assert.equal(reducedChartAnimations.path, 0, "减少动态效果时不播放曲线绘制");
  assert.equal(reducedChartAnimations.points, 0);
  assert.equal(reducedChartAnimations.dash, "");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "ebbinghaus review passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
