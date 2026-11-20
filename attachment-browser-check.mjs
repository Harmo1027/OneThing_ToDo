import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createTodoServer } from "./server.mjs";
import { openTodo } from "./test-browser-helpers.mjs";

const { chromium } = createRequire(import.meta.url)(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "attachment-"));
const pdfContent = "%PDF-1.4\nattachment test\n%%EOF\n";
const sample = async (name, content) => {
  const filename = path.join(dataDirectory, name);
  await writeFile(filename, content);
  return filename;
};
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = data => {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
};
const makePng = (size = 48, color = [0, 120, 212]) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set(color, 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
};
const pdfFile = await sample("方案.pdf", pdfContent);
const docxFile = await sample("汇报.docx", "DOCX attachment test");
const pptFile = await sample("演示.ppt", "PPT attachment test");
const pngFile = await sample("示意图.png", makePng());
const txtFile = await sample("说明.txt", "not supported");
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await openTodo(page);
  await page.waitForFunction(() => document.querySelector("#save-path").textContent.includes("attachment-"));

  await page.locator("#task-heading").fill("附件检查");
  await page.locator("#task-input").fill("为这条待办添加 PDF、DOCX 和 PPT 附件。");
  await page.locator("#add-form .add-button").click();
  const card = page.locator("#task-list .task-card").filter({ hasText: "附件检查" });
  const taskId = await card.getAttribute("data-id");
  const waitForCount = count => page.waitForFunction(({ taskId, count }) => {
    const saved = JSON.parse(localStorage.getItem("yijian.workspace.v2"));
    return saved.tasks.find(task => task.id === taskId)?.attachments?.length === count;
  }, { taskId, count });
  const pickFiles = async (locator, files) => {
    const chooserPromise = page.waitForEvent("filechooser");
    await locator.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(files);
  };

  await pickFiles(card.locator('[data-action="attach"]'), [pdfFile, docxFile, pngFile]);
  await waitForCount(3);
  assert.equal((await card.locator(".attachment-badge").innerText()).trim(), "3");

  await card.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  const previewChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#task-preview-attach").click();
  const previewChooser = await previewChooserPromise;
  await previewChooser.setFiles(pptFile);
  await waitForCount(4);
  await page.waitForFunction(() => {
    const image = document.querySelector("#task-preview-attachment-gallery img");
    return image?.complete && image.naturalWidth > 0;
  });
  assert.equal(await page.locator("#task-preview-attachments-count").textContent(), "4");
  assert.deepEqual(await page.locator(".attachment-name").allTextContents(), ["方案.pdf", "汇报.docx", "演示.ppt"]);
  assert.deepEqual(await page.locator(".attachment-type").allTextContents(), ["PDF", "DOCX", "PPT"]);
  assert.equal(await page.locator(".attachment-image-name").textContent(), "示意图.png");
  assert.equal(await page.locator(".attachment-image-preview").getAttribute("alt"), "示意图.png");
  assert.equal(await page.locator("#save-status").textContent(), "有待保存的更改");

  const invalidChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#task-preview-attach").click();
  const invalidChooser = await invalidChooserPromise;
  await invalidChooser.setFiles(txtFile);
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("仅支持文档或常用图片"));
  assert.equal(await page.locator("#task-preview-attachments-count").textContent(), "4");

  await page.locator("#task-preview-close").click();
  await page.locator("#save-button").click();
  await page.waitForFunction(() => document.querySelector("#save-status").textContent === "已保存到本地");
  const manifest = JSON.parse(await readFile(path.join(dataDirectory, ".todo-workspace.json"), "utf8"));
  const savedTask = manifest.state.tasks.find(task => task.id === taskId);
  assert.equal(savedTask.attachments.length, 4);
  const pptAttachment = savedTask.attachments.find(attachment => attachment.name === "演示.ppt");
  assert.ok(pptAttachment);
  const attachmentFolder = path.join(dataDirectory, ".attachments", taskId);
  await access(path.join(attachmentFolder, `${savedTask.attachments[0].id}.${savedTask.attachments[0].ext}`));

  await page.reload();
  await openTodo(page);
  await page.waitForFunction(() => document.querySelector("#save-path").textContent.includes("attachment-"));
  const restoredCard = page.locator("#task-list .task-card").filter({ hasText: "附件检查" });
  assert.equal((await restoredCard.locator(".attachment-badge").innerText()).trim(), "4");
  await page.locator("#task-list").screenshot({ path: path.join(dataDirectory, "attachment-card.png") });
  await restoredCard.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector("#task-preview-attachment-gallery img");
    return image?.complete && image.naturalWidth > 0;
  });
  assert.deepEqual(await page.locator(".attachment-name").allTextContents(), ["方案.pdf", "汇报.docx", "演示.ppt"]);
  assert.equal(await page.locator(".attachment-image-preview").count(), 1);
  await page.screenshot({ path: path.join(dataDirectory, "attachment-preview.png") });

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#task-preview-attachments-list .attachment-download").first().click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "方案.pdf");
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  assert.equal(await readFile(downloadPath, "utf8"), pdfContent);

  await page.locator(".attachment-item").filter({ hasText: "演示.ppt" }).locator(".attachment-remove").click();
  await page.waitForFunction(() => document.querySelectorAll("#task-preview-attachments-list .attachment-item").length === 2);
  assert.equal(await page.locator("#task-preview-attachments-count").textContent(), "3");
  assert.equal(await page.locator(".attachment-image-preview").count(), 1);
  await page.locator("#task-preview-close").click();
  await page.locator("#save-button").click();
  await page.waitForFunction(() => document.querySelector("#save-status").textContent === "已保存到本地");
  await assert.rejects(access(path.join(attachmentFolder, `${pptAttachment.id}.${pptAttachment.ext}`)));
  await access(path.join(attachmentFolder, `${savedTask.attachments[0].id}.${savedTask.attachments[0].ext}`));

  await page.setViewportSize({ width: 375, height: 900 });
  await restoredCard.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  await page.locator("#task-preview-attachments").scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "附件详情在移动端不横向溢出");
  await page.screenshot({ path: path.join(dataDirectory, "attachment-mobile.png") });

  await page.locator("#task-preview-close").click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#theme-toggle").click();
  await page.waitForTimeout(250);
  await restoredCard.locator(".task-title").click();
  await page.locator("#task-preview-dialog").waitFor({ state: "visible" });
  assert.deepEqual(await page.locator(".attachment-name").allTextContents(), ["方案.pdf", "汇报.docx"]);
  await page.screenshot({ path: path.join(dataDirectory, "attachment-dark.png") });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "attachments passed", dataDirectory }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}