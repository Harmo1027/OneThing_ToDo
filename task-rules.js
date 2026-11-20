// 在样式表和首帧之前恢复外观，避免深浅色或自定义背景闪一下。
(function () {
  if (typeof document === "undefined" || typeof localStorage === "undefined") return;
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("yijian.theme"); } catch { /* file:// 下存储可能不可用 */ }
  const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  let background = null;
  try { background = localStorage.getItem("yijian.background.v1"); } catch { /* file:// 下存储可能不可用 */ }
  if (background && background.length < 4000000 && /^data:image\/(?:webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(background)) {
    let backgroundBlur = 20;
    try {
      const savedBlur = localStorage.getItem("yijian.backgroundBlur.v1");
      const blurNumber = Number(savedBlur);
      if (savedBlur !== null && savedBlur !== "" && Number.isFinite(blurNumber)) backgroundBlur = Math.min(40, Math.max(0, Math.round(blurNumber / 2) * 2));
    } catch { /* 存储不可用时使用默认强度 */ }
    document.documentElement.dataset.background = "custom";
    document.documentElement.style.setProperty("--custom-bg-image", 'url("' + background + '")');
    document.documentElement.style.setProperty("--bg-blur", backgroundBlur + "px");
    document.documentElement.style.setProperty("--card-blur", Math.max(26, backgroundBlur + 6) + "px");
  }
  let cardTransparency = null;
  try {
    const savedTransparency = localStorage.getItem("yijian.cardTransparency.v1");
    const transparencyNumber = Number(savedTransparency);
    if (savedTransparency !== null && savedTransparency !== "" && Number.isFinite(transparencyNumber)) {
      cardTransparency = Math.min(80, Math.max(0, Math.round(transparencyNumber / 2) * 2));
    }
  } catch { /* 存储不可用时使用默认透明度 */ }
  if (cardTransparency !== null) {
    const alphaScale = (100 - cardTransparency) / 62;
    document.documentElement.style.setProperty("--card-alpha-scale", alphaScale.toFixed(4));
    document.documentElement.style.setProperty("--card-gradient-scale", Math.min(1, alphaScale).toFixed(4));
  }
})();

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TodoRules = factory();
})(globalThis, function () {
  "use strict";
  const THREE_DAYS = 72 * 60 * 60 * 1000;
  const ATTACHMENT_TYPES = Object.freeze({
    docx: Object.freeze({ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX" }),
    pdf: Object.freeze({ mime: "application/pdf", label: "PDF" }),
    ppt: Object.freeze({ mime: "application/vnd.ms-powerpoint", label: "PPT" }),
    pptx: Object.freeze({ mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PPTX" }),
    png: Object.freeze({ mime: "image/png", label: "PNG", image: true }),
    jpg: Object.freeze({ mime: "image/jpeg", label: "JPG", image: true }),
    jpeg: Object.freeze({ mime: "image/jpeg", label: "JPEG", image: true }),
    gif: Object.freeze({ mime: "image/gif", label: "GIF", image: true }),
    webp: Object.freeze({ mime: "image/webp", label: "WEBP", image: true }),
    bmp: Object.freeze({ mime: "image/bmp", label: "BMP", image: true }),
    avif: Object.freeze({ mime: "image/avif", label: "AVIF", image: true })
  });
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 8;
  const ATTACHMENT_ID = /^[a-zA-Z0-9-]{1,100}$/;
  function validDueDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  // A date-only deadline ends at 23:59:59.999 in the user's local time zone.
  function deadline(task) {
    return validDueDate(task.dueDate) ? new Date(`${task.dueDate}T23:59:59.999`).getTime() : null;
  }
  function isUrgent(task, now = Date.now()) {
    const due = deadline(task);
    return task.priority === "urgent" || (due !== null && due - now < THREE_DAYS);
  }
  function urgentReason(task, now = Date.now()) {
    const due = deadline(task);
    if (due !== null && due < now) return "已逾期";
    if (due !== null && due - now < THREE_DAYS) return "不足 3 天";
    return task.priority === "urgent" ? "手动设为紧迫" : "一般";
  }
  function attachmentExtension(name) {
    if (typeof name !== "string") return "";
    const match = /\.([a-zA-Z0-9]+)\s*$/.exec(name);
    const extension = match ? match[1].toLowerCase() : "";
    return Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, extension) ? extension : "";
  }
  function validAttachmentName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 180 && name === name.trim() && !/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(name) && !/[. ]$/.test(name) && !/^\.+$/.test(name);
  }
  function validAttachment(value) {
    if (!value || typeof value !== "object") return false;
    const extension = typeof value.ext === "string" ? value.ext.toLowerCase() : "";
    return typeof value.id === "string" && ATTACHMENT_ID.test(value.id) && validAttachmentName(value.name) && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= MAX_ATTACHMENT_BYTES && Boolean(ATTACHMENT_TYPES[extension]) && attachmentExtension(value.name) === extension;
  }
  return { THREE_DAYS, validDueDate, deadline, isUrgent, urgentReason, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK, attachmentExtension, validAttachmentName, validAttachment };
});
