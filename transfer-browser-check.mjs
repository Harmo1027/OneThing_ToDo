import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";
import { openTodo } from "./test-browser-helpers.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "transfer-"));
const now = Date.now();
const task = (id, title, groupId, { completed = false, attachments = [] } = {}) => ({
  id,
  title,
  content: `${title}的正文`,
  groupId,
  completed,
  completedAt: completed ? now - 86400000 : 0,
  reviews: [0, 0, 0, 0],
  attachments,
  createdAt: now - 3 * 86400000,
  pinnedAt: 0,
  collapsed: false,
  dueDate: null,
  priority: "normal",
  homework: false,
  longTerm: false
});
const seed = {
  version: 2,
  modifiedAt: now,
  groups: [{ id: "group-work", name: "工作" }, { id: "group-study", name: "学习" }],
  tasks: [
    task("export-active", "导出任务一", "group-work"),
    task("export-done", "已完成任务", "group-study", { completed: true }),
    task("export-attachment", "附件任务", "group-work", { attachments: [{ id: "export-att", name: "旧图.png", size: 10, ext: "png" }] })
  ],
  dailyTasks: [{ id: "export-daily", title: "导出每日任务", completedOn: null }]
};
const importPayload = {
  format: "yijian.workspace.v2",
  revision: 1,
  state: {
    version: 2,
    modifiedAt: now,
    groups: [{ id: "group-import", name: "导入分组" }],
    tasks: [
      task("import-active", "导入任务", "group-import", { attachments: [{ id: "import-att", name: "导入图.png", size: 12, ext: "png" }] }),
      task("import-done", "导入已完成", "group-import", { completed: true })
    ],
    dailyTasks: [{ id: "import-daily", title: "导入每日任务", completedOn: null }]
  }
};
const importFile = path.join(dataDirectory, "import.json");
await writeFile(importFile, JSON.stringify(importPayload));
const invalidFile = path.join(dataDirectory, "invalid.json");
await writeFile(invalidFile, "not a todo file");
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce", acceptDownloads: true });
  await context.addInitScript(state => {
    if (!localStorage.getItem("yijian.workspace.v2")) localStorage.setItem("yijian.workspace.v2", JSON.stringify(state));
  }, seed);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await openTodo(page);
  await page.waitForFunction(() => document.querySelector("#save-path").textContent.includes("transfer-"));
  const currentState = () => page.evaluate(() => JSON.parse(localStorage.getItem("yijian.workspace.v2")));
  const chooseImport = async file => {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("#import-workspace").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(file);
    await page.locator("#import-dialog").waitFor({ state: "visible" });
  };

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-workspace").click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^一件待办-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = path.join(dataDirectory, download.suggestedFilename());
  await download.saveAs(downloadPath);
  const exported = JSON.parse(await readFile(downloadPath, "utf8"));
  assert.equal(exported.format, "yijian.transfer.v1");
  assert.equal(exported.app, "yijian-todo");
  assert.equal(exported.state.tasks.length, 3);
  assert.equal(exported.state.groups.length, 2);
  assert.equal(exported.state.dailyTasks.length, 1);
  assert.equal(exported.excludedAttachments, 1);
  assert.equal(exported.state.tasks.some(task => (task.attachments || []).length), false, "导出不包含附件元数据");
  assert.equal((await currentState()).tasks.find(task => task.id === "export-attachment").attachments.length, 1, "导出不应修改原状态");

  await chooseImport(downloadPath);
  assert.match(await page.locator("#import-summary").textContent(), /3 件待办/);
  assert.match(await page.locator("#import-summary").textContent(), /\.json/);
  await page.locator("#import-cancel").click();
  await page.locator("#import-dialog").waitFor({ state: "hidden" });
  assert.equal((await currentState()).tasks.length, 3, "取消导入不改变数据");

  await chooseImport(downloadPath);
  await page.locator("#import-confirm").click();
  await page.locator("#import-dialog").waitFor({ state: "hidden" });
  const roundTrip = await currentState();
  assert.equal(roundTrip.tasks.length, 3);
  assert.equal(roundTrip.tasks.every(task => task.attachments.length === 0), true, "导出的文件可以完整回导且不含附件");

  await chooseImport(importFile);
  assert.match(await page.locator("#import-summary").textContent(), /2 件待办/);
  assert.match(await page.locator("#import-summary").textContent(), /1 个分组/);
  assert.match(await page.locator("#import-summary").textContent(), /1 条每日任务/);
  assert.match(await page.locator("#import-summary").textContent(), /1 个附件/);
  await page.screenshot({ path: path.join(dataDirectory, "transfer-import-dialog.png") });
  await page.locator("#import-confirm").click();
  await page.locator("#import-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelectorAll("#task-list .task-card").length === 1);
  assert.equal(await page.locator("#completed-count").textContent(), "1");
  const imported = await currentState();
  assert.equal(imported.tasks.length, 2);
  assert.equal(imported.groups.length, 1);
  assert.equal(imported.dailyTasks.length, 1);
  assert.equal(imported.tasks.every(task => task.attachments.length === 0), true, "导入会忽略附件元数据");
  assert.equal(await page.locator("#task-list .task-card").filter({ hasText: "导入任务" }).count(), 1);
  assert.equal(await page.locator("#task-list .task-card").filter({ hasText: "导出任务一" }).count(), 0);

  const invalidChooser = page.waitForEvent("filechooser");
  await page.locator("#import-workspace").click();
  const chooser = await invalidChooser;
  await chooser.setFiles(invalidFile);
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("导入失败"));
  assert.equal(await page.locator("#import-dialog").isVisible(), false);
  assert.equal((await currentState()).tasks.length, 2);

  await page.reload();
  await openTodo(page);
  await page.waitForFunction(() => document.querySelector("#save-path").textContent.includes("transfer-"));
  assert.equal((await currentState()).tasks.length, 2);

  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "数据迁移按钮移动端不横向溢出");
  const exportBox = await page.locator("#export-workspace").boundingBox();
  const importBox = await page.locator("#import-workspace").boundingBox();
  assert.ok(exportBox && exportBox.x >= 0 && exportBox.x + exportBox.width <= 375);
  assert.ok(importBox && importBox.x >= 0 && importBox.x + importBox.width <= 375);
  await page.screenshot({ path: path.join(dataDirectory, "transfer-mobile.png") });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "transfer passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}