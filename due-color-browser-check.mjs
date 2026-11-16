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
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "due-color-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const now = new Date("2026-11-13T12:00:00+08:00");
const DAY = 86400000;
const task = (id, title, dueDate, priority = "normal", completed = false) => ({
  id, title, content: `${title}的正文，用于检查卡片截止颜色。`, completed,
  completedAt: completed ? now.getTime() - DAY : 0,
  reviews: [0, 0, 0, 0], groupId: null, createdAt: now.getTime() - id.length * DAY,
  collapsed: false, dueDate, priority, homework: false, longTerm: false, pinnedAt: 0
});
const seed = {
  version: 2,
  modifiedAt: now.getTime(),
  groups: [],
  dailyTasks: [],
  tasks: [
    task("due-normal-far", "普通远期", "2026-11-25"),
    task("due-normal-mid", "普通临近", "2026-11-18"),
    task("due-normal-near", "普通紧迫三天", "2026-11-16"),
    task("due-normal-none", "普通无期限", null),
    task("due-urgent-far", "紧迫远期", "2026-11-25", "urgent"),
    task("due-urgent-mid", "紧迫临近", "2026-11-18", "urgent"),
    task("due-urgent-near", "紧迫紧迫", "2026-11-16", "urgent"),
    task("due-done-near", "已完成临近", "2026-11-16", "normal", true)
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
  await page.goto(base);
  await openTodo(page);
  const settle = async () => {
    await page.waitForFunction(() => { const frost = document.querySelector(".page-frost"); return !frost || frost.hidden; }, null, { timeout: 5000 });
    await page.waitForTimeout(800);
  };
  await settle();
  const card = title => page.locator("#task-list .task-card").filter({ hasText: title });
  const info = title => card(title).evaluate(node => {
    const style = getComputedStyle(node);
    return {
      classes: [...node.classList],
      tier: node.dataset.dueTier,
      rgb: style.getPropertyValue("--due-rgb").trim(),
      alpha: parseFloat(style.getPropertyValue("--due-a")),
      border: parseFloat(style.getPropertyValue("--due-border")),
      image: style.backgroundImage,
      color: style.backgroundColor
    };
  });
  const expectTier = async (title, tier, urgent) => {
    const data = await info(title);
    assert.equal(data.tier, String(tier), `${title} 档位`);
    assert.equal(data.classes.includes(`due-tier-${tier}`), true, `${title} 应带 due-tier-${tier}`);
    assert.equal(data.classes.includes("is-urgent"), urgent, `${title} 紧迫状态`);
    return data;
  };

  const normalFar = await expectTier("普通远期", 1, false);
  const normalMid = await expectTier("普通临近", 2, false);
  const normalNear = await expectTier("普通紧迫三天", 3, false);
  const normalNone = await expectTier("普通无期限", 1, false);
  const urgentFar = await expectTier("紧迫远期", 1, true);
  const urgentMid = await expectTier("紧迫临近", 2, true);
  const urgentNear = await expectTier("紧迫紧迫", 3, true);
  for (const data of [normalFar, normalMid, normalNear, normalNone]) {
    assert.equal(data.rgb.replace(/\s+/g, ""), "0,120,212", "一般待办使用蓝色主题");
    assert.match(data.image, /linear-gradient/);
  }
  for (const data of [urgentFar, urgentMid, urgentNear]) {
    assert.equal(data.rgb.replace(/\s+/g, ""), "124,77,255", "紧迫待办使用紫色主题");
    assert.match(data.image, /linear-gradient/);
  }
  assert.ok(normalFar.alpha < normalMid.alpha && normalMid.alpha < normalNear.alpha, "普通待办颜色应随日期临近逐档加深");
  assert.ok(urgentFar.alpha < urgentMid.alpha && urgentMid.alpha < urgentNear.alpha, "紧迫待办颜色应随日期临近逐档加深");
  assert.equal(normalNone.alpha, normalFar.alpha, "无截止日期使用最浅档");
  assert.notEqual(normalFar.image, normalMid.image);
  assert.notEqual(normalMid.image, normalNear.image);
  assert.equal(normalFar.color, "rgba(255, 255, 255, 0.62)", "颜色加深不覆盖基础玻璃底色");
  const completed = await card("已完成临近").count();
  const completedInfo = await page.locator("#completed-list .task-card").filter({ hasText: "已完成临近" }).evaluate(node => ({ classes: [...node.classList], image: getComputedStyle(node).backgroundImage }));
  assert.equal(completed, 0, "主页不显示已完成卡片");
  assert.equal(completedInfo.classes.some(name => name.startsWith("due-tier-")), false, "已完成卡片不参与截止颜色");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#toast").evaluate(node => node.classList.remove("visible"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(dataDirectory, "due-color-light.png"), fullPage: true });

  await page.locator("#theme-toggle").click();
  await settle();
  const darkFar = await expectTier("普通远期", 1, false);
  const darkNear = await expectTier("普通紧迫三天", 3, false);
  const darkUrgent = await expectTier("紧迫紧迫", 3, true);
  assert.equal(darkFar.color, "rgba(34, 41, 55, 0.58)", "深色基础玻璃底色保留");
  assert.notEqual(darkFar.image, darkNear.image);
  assert.match(darkUrgent.image, /linear-gradient/);
  await page.locator("#toast").evaluate(node => node.classList.remove("visible"));
  await page.locator("#task-list .task-card").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dataDirectory, "due-color-dark.png") });

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(500);
  await page.clock.setSystemTime(new Date(now.getTime() + 5 * DAY));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(500);
  const laterFar = await expectTier("普通远期", 2, false);
  const laterMid = await expectTier("普通临近", 3, true);
  const laterNear = await expectTier("普通紧迫三天", 3, true);
  assert.equal(laterFar.rgb.replace(/\s+/g, ""), "0,120,212");
  assert.equal(laterMid.rgb.replace(/\s+/g, ""), "124,77,255");
  assert.ok(laterMid.alpha > 0.2, "自动紧迫后使用深色紫色档");
  assert.equal(await page.locator("#task-list .task-card").filter({ hasText: "普通无期限" }).getAttribute("data-due-tier"), "1");

  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "截止颜色卡片移动端无横向溢出");
  await page.screenshot({ path: path.join(dataDirectory, "due-color-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "due color tiers passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
