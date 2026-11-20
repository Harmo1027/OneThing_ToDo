import { test } from "node:test";
import assert from "node:assert/strict";
import rules from "./task-rules.js";

test("日期格式与闰年校验", () => {
  for (const date of ["2026-11-10", "2028-02-29", "0001-01-01", "9999-12-31"]) assert.equal(rules.validDueDate(date), true, date);
  for (const date of [null, undefined, "", "2026-02-29", "2026-02-30", "2026-13-01", "2026-11-31", "26-11-10", "0000-01-01"]) assert.equal(rules.validDueDate(date), false, String(date));
});
test("截止日结束时计时，严格小于 72 小时才自动紧迫，逾期也紧迫", () => {
  const task = { dueDate: "2026-11-13", priority: "normal" };
  const due = new Date("2026-11-13T23:59:59.999").getTime();
  assert.equal(rules.deadline(task), due);
  assert.equal(rules.isUrgent(task, due - rules.THREE_DAYS - 1), false);
  assert.equal(rules.isUrgent(task, due - rules.THREE_DAYS), false);
  assert.equal(rules.isUrgent(task, due - rules.THREE_DAYS + 1), true);
  assert.equal(rules.isUrgent(task, due), true);
  assert.equal(rules.isUrgent(task, due + 1), true);
  assert.equal(rules.urgentReason(task, due + 1), "已逾期");
  assert.equal(rules.urgentReason(task, due - 1), "不足 3 天");
});
test("手动紧迫无需截止日期，一般且无日期不自动紧迫，延期后恢复手动优先级", () => {
  assert.equal(rules.isUrgent({ priority: "normal", dueDate: null }), false);
  assert.equal(rules.isUrgent({ priority: "urgent", dueDate: null }), true);
  assert.equal(rules.urgentReason({ priority: "urgent", dueDate: null }), "手动设为紧迫");
  const now = new Date("2026-11-10T12:00:00").getTime();
  assert.equal(rules.isUrgent({ priority: "normal", dueDate: "2026-11-11" }, now), true);
  assert.equal(rules.isUrgent({ priority: "normal", dueDate: "2026-11-20" }, now), false);
  assert.equal(rules.isUrgent({ priority: "urgent", dueDate: "2026-11-20" }, now), true);
});
test("附件格式、名称、大小与元数据校验", () => {
  assert.deepEqual(Object.keys(rules.ATTACHMENT_TYPES).sort(), ["avif", "bmp", "docx", "gif", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "webp"]);
  for (const ext of ["docx", "pdf", "ppt", "pptx", "png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]) assert.match(rules.ATTACHMENT_TYPES[ext].mime, /^(application|image)\//);
  for (const ext of ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]) assert.equal(rules.ATTACHMENT_TYPES[ext].image, true);
  assert.equal(rules.attachmentExtension("项目方案.PDF"), "pdf");
  assert.equal(rules.attachmentExtension("答辩稿.pptx"), "pptx");
  assert.equal(rules.attachmentExtension("截图.PNG"), "png");
  assert.equal(rules.attachmentExtension("照片.jpeg"), "jpeg");
  assert.equal(rules.attachmentExtension("说明.txt"), "");
  assert.equal(rules.attachmentExtension("没有扩展名"), "");
  assert.equal(rules.attachmentExtension("../危险.pdf"), "pdf");
  assert.equal(rules.validAttachmentName("项目方案.pdf"), true);
  assert.equal(rules.validAttachmentName("带 空格 的文档.docx"), true);
  assert.equal(rules.validAttachmentName("末尾点.pdf."), false);
  assert.equal(rules.validAttachmentName("../路径.pdf"), false);
  assert.equal(rules.validAttachmentName(""), false);
  const attachment = { id: "attach-1", name: "方案.pdf", size: 1024, ext: "pdf" };
  assert.equal(rules.validAttachment(attachment), true);
  assert.equal(rules.validAttachment({ ...attachment, id: "bad/id" }), false);
  assert.equal(rules.validAttachment({ ...attachment, ext: "docx" }), false);
  assert.equal(rules.validAttachment({ ...attachment, name: "方案.txt" }), false);
  assert.equal(rules.validAttachment({ ...attachment, size: 0 }), false);
  assert.equal(rules.validAttachment({ ...attachment, size: rules.MAX_ATTACHMENT_BYTES + 1 }), false);
  assert.equal(rules.validAttachment({ ...attachment, size: 1.5 }), false);
});
