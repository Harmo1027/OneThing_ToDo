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
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "save-changes-"));
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
  const popover = page.locator("#save-changes-popover");
  const status = page.locator("#save-status");
  const statusText = () => status.textContent();
  const waitPending = () => page.waitForFunction(() => document.querySelector("#save-status").textContent === "有待保存的更改" && document.querySelector("#save-status").dataset.pending === "true");
  const listTexts = () => page.locator("#save-changes-list li").allTextContents();
  const hoverStatus = async () => {
    await status.hover();
    await popover.waitFor({ state: "visible" });
    await page.waitForTimeout(180);
  };
  const addTask = async (title, content = "待保存差异测试的正文。") => {
    await page.locator("#task-heading").fill(title);
    await page.locator("#task-input").fill(content);
    await page.locator(".add-button").click();
  };
  const addGroup = async name => {
    await page.locator("#add-group-button").click();
    await page.locator("#group-name").fill(name);
    await page.locator("#group-form .primary-button").click();
  };
  const addDaily = async title => {
    await page.locator("#daily-button").click();
    await page.locator("#daily-input").fill(title);
    await page.locator("#daily-add-form .primary-button").click();
    await page.locator("#daily-close").click();
  };
  const save = async () => {
    await page.locator("#save-button").click();
    await page.waitForFunction(() => document.querySelector("#save-status").textContent === "已保存到本地");
  };
  const hideToast = () => page.evaluate(() => document.querySelector("#toast").classList.remove("visible"));

  await page.goto(base);
  await openTodo(page);
  assert.equal(await popover.isVisible(), false);

  await addGroup("工作");
  await addTask("周报");
  await addTask("阅读");
  await addTask("散步");
  await addDaily("喝水");
  await save();
  assert.equal(await statusText(), "已保存到本地");
  assert.equal(await status.getAttribute("data-pending"), "false");
  assert.equal(await status.getAttribute("tabindex"), null);
  assert.equal(await status.getAttribute("aria-describedby"), null);
  await status.hover();
  assert.equal(await popover.isVisible(), false);

  await addTask("马上删掉");
  await page.locator("#task-list .task-card").filter({ hasText: "马上删掉" }).locator(".delete-button").click();
  assert.equal(await statusText(), "已保存到本地", "新建待办后立即删除，不应残留待保存状态");
  assert.equal(await status.getAttribute("data-pending"), "false");
  assert.equal(await status.getAttribute("tabindex"), null);
  await status.hover();
  assert.equal(await popover.isVisible(), false);

  await page.locator('#system-groups [data-group-id="all"]').click();
  await addTask("新任务");
  await page.locator("#task-list .task-card").filter({ hasText: "散步" }).locator(".delete-button").click();
  await page.locator("#task-list .task-card").filter({ hasText: "周报" }).locator(".complete-button").click();
  await page.locator("#task-list .task-card").filter({ hasText: "阅读" }).locator(".edit-button").click();
  await page.locator("#edit-title").fill("阅读计划");
  await page.locator("#edit-due-date").fill("2027-12-31");
  await page.locator("#edit-priority").selectOption("urgent");
  await page.locator("#edit-form .primary-button").click();
  await page.locator("#task-list .task-card").filter({ hasText: "阅读计划" }).locator("select").selectOption("");
  await page.locator("#task-list .task-card").filter({ hasText: "阅读计划" }).locator(".pin-button").click();
  await addGroup("学习");
  await addDaily("拉伸");
  await waitPending();

  assert.equal(await status.getAttribute("tabindex"), "0");
  assert.equal(await status.getAttribute("aria-describedby"), "save-changes-popover");
  assert.equal(await popover.isVisible(), false);
  await hoverStatus();
  assert.equal(await popover.evaluate(node => getComputedStyle(node).opacity), "1");
  assert.match(await popover.textContent(), /待保存的更改/);
  assert.equal(await page.locator("#save-changes-count").textContent(), "8 项", JSON.stringify(await listTexts()));
  const expected = [
    "新建分组「学习」",
    "完成待办「周报」",
    "置顶待办「阅读计划」",
    "修改待办「阅读计划」：标题、截止日期改为 2027-12-31、优先级改为紧迫",
    "新增待办「新任务」",
    "移动待办「阅读计划」：工作 → 未分组",
    "删除待办「散步」",
    "新增每日任务「拉伸」"
  ];
  const changes = await listTexts();
  assert.equal(changes.length, expected.length);
  for (const fragment of expected) assert.ok(changes.some(text => text.includes(fragment)), `缺少更改：${fragment}\n实际：${changes.join("\n")}`);
  assert.equal(await page.locator("#save-changes-list .save-change-add").count(), 3);
  assert.equal(await page.locator("#save-changes-list .save-change-remove").count(), 1);
  assert.equal(await page.locator("#save-changes-list .save-change-complete").count(), 1);
  const box = await popover.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 1440 && box.y >= 0 && box.y + box.height <= 1100, `悬浮详情超出视口：${JSON.stringify(box)}`);
  await hideToast();
  await page.screenshot({ path: path.join(dataDirectory, "save-changes-light.png"), fullPage: true });

  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  assert.equal(await popover.isVisible(), false);
  await status.focus();
  await popover.waitFor({ state: "visible" });
  assert.equal(await status.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  assert.equal(await popover.isVisible(), false);

  await page.reload();
  await openTodo(page);
  await waitPending();
  await hoverStatus();
  const restoredChanges = await listTexts();
  assert.equal(restoredChanges.length, 8);
  assert.ok(restoredChanges.some(text => text.includes("新建分组「学习」")));
  assert.ok(restoredChanges.some(text => text.includes("删除待办「散步」")));

  await save();
  assert.equal(await status.getAttribute("data-pending"), "false");
  assert.equal(await popover.isVisible(), false);
  await status.hover();
  await page.waitForTimeout(200);
  assert.equal(await popover.isVisible(), false);

  await page.locator("#task-list .task-card").filter({ hasText: "阅读计划" }).locator(".pin-button").click();
  await waitPending();
  assert.equal(await page.locator("#save-changes-count").textContent(), "1 项");
  await hoverStatus();
  const afterSave = await listTexts();
  assert.equal(afterSave.length, 1);
  assert.match(afterSave[0], /取消置顶待办「阅读计划」/);
  assert.ok(afterSave.every(text => !text.includes("新增待办")), "保存成功后不应继续显示已保存的新增事项");

  await page.locator("#theme-toggle").click();
  await hoverStatus();
  assert.match(await popover.evaluate(node => getComputedStyle(node).backgroundColor), /^rgba?\(26, 34, 45/);
  await hideToast();
  await page.screenshot({ path: path.join(dataDirectory, "save-changes-dark.png"), fullPage: true });

  await page.setViewportSize({ width: 1024, height: 900 });
  await hoverStatus();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "1024px 悬浮详情导致水平溢出");
  await page.setViewportSize({ width: 960, height: 900 });
  assert.equal(await status.isVisible(), false);
  assert.equal(await popover.isVisible(), false);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await status.isVisible(), false);
  assert.equal(await popover.isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "移动端水平溢出");
  await page.screenshot({ path: path.join(dataDirectory, "save-changes-mobile.png"), fullPage: true });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "save changes tooltip passed", dataDirectory, changes: expected.length }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
