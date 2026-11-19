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
  return { THREE_DAYS, validDueDate, deadline, isUrgent, urgentReason };
});
