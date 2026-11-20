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
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "markdown-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const content = [
  "## 本周计划",
  "**加粗**、*斜体*、~~删除~~ 与 `行内代码`",
  "",
  "- 第一项",
  "- [x] 已完成项",
  "- [ ] 未完成项",
  "",
  "> 引用一段话",
  "",
  "[安全链接](https://example.com/?a=1&b=2)",
  "",
  "[危险链接](javascript:alert(1))",
  "",
  "```js",
  'const x = "<tag>";',
  "```",
  "",
  "<script>window.__mdXss = 1</script>"
].join("\n");
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await openTodo(page);

  await page.locator("#task-heading").fill("**Markdown** 卡片");
  await page.locator("#task-input").fill(content);
  await page.locator("#add-form .add-button").click();
  const card = page.locator("#task-list .task-card").filter({ hasText: "Markdown 卡片" });
  await card.locator(".task-title strong").waitFor();
  assert.equal(await card.locator(".task-title").textContent(), "Markdown 卡片");
  assert.equal(await card.locator(".task-description").evaluate(node => node.classList.contains("markdown-body")), true);
  assert.equal(await card.locator(".task-description h2").textContent(), "本周计划");
  assert.equal(await card.locator(".task-description strong").textContent(), "加粗");
  assert.equal(await card.locator(".task-description em").textContent(), "斜体");
  assert.equal(await card.locator(".task-description del").textContent(), "删除");
  assert.equal(await card.locator(".task-description li").count(), 3);
  assert.equal(await card.locator(".task-description .md-task-item").count(), 2);
  assert.equal(await card.locator(".task-description .md-task-box.is-done").count(), 1);
  assert.equal(await card.locator(".task-description blockquote").textContent(), "引用一段话");
  assert.equal(await card.locator(".task-description pre code").textContent(), 'const x = "<tag>";');
  assert.equal(await card.locator(".task-description a").count(), 1, "不安全的 javascript 链接不应生成锚点");
  assert.match(await card.locator(".task-description a").getAttribute("href"), /^https:\/\/example\.com/);
  assert.equal(await card.locator(".task-description a").getAttribute("target"), "_blank");
  assert.match(await card.locator(".task-description a").getAttribute("rel"), /noopener/);
  assert.match(await card.locator(".task-description").textContent(), /javascript:alert\(1\)/);
  assert.equal(await page.evaluate(() => window.__mdXss), undefined);
  assert.equal(await card.locator("script").count(), 0);

  await card.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#task-preview-title strong").textContent(), "Markdown");
  assert.equal(await page.locator("#task-preview-content h2").textContent(), "本周计划");
  assert.equal(await page.locator("#task-preview-content pre code").textContent(), 'const x = "<tag>";');
  assert.equal(await page.locator("#task-preview-content a").count(), 1);
  assert.equal(await page.evaluate(() => window.__mdXss), undefined);
  await page.locator("#task-preview-copy").click();
  await page.waitForFunction(() => document.querySelector("#task-preview-copy").textContent === "已复制");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /\*\*加粗\*\*/);
  assert.match(copied, /```js/);
  await page.screenshot({ path: path.join(dataDirectory, "markdown-preview.png") });
  await page.locator("#task-preview-close").click();

  await page.locator("#task-heading").fill("");
  await page.locator("#task-input").fill("# 无标题 Markdown\n- 列表项\n**加粗内容**");
  await page.locator("#add-form .add-button").click();
  const titleless = page.locator("#task-list .task-card").filter({ hasText: "无标题 Markdown" });
  assert.equal(await titleless.locator(".task-title.markdown-body h1").textContent(), "无标题 Markdown");
  assert.equal(await titleless.locator(".task-title.markdown-body li").textContent(), "列表项");
  assert.equal(await titleless.locator(".task-title.markdown-body strong").textContent(), "加粗内容");
  await page.locator("#task-list").screenshot({ path: path.join(dataDirectory, "markdown-cards.png") });

  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Markdown 页面移动端不横向溢出");
  await card.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Markdown 详情移动端不横向溢出");
  await page.screenshot({ path: path.join(dataDirectory, "markdown-mobile.png") });
  await page.locator("#task-preview-close").click();

  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(250);
  await card.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#task-preview-content h2").textContent(), "本周计划");
  await page.screenshot({ path: path.join(dataDirectory, "markdown-dark.png") });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "markdown passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}