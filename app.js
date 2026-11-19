(() => {
  "use strict";
  const STORAGE_KEY = "yijian.workspace.v2";
  const LEGACY_KEY = "yijian.todos.v1";
  const $ = selector => document.querySelector(selector);
  const input = $("#task-input");
  const headingInput = $("#task-heading");
  const list = $("#task-list");
  const completedList = $("#completed-list");
  const pinnedList = $("#pinned-list");
  const urgentList = $("#urgent-list");
  const rules = globalThis.TodoRules;
  const specialGroups = [
    { id: "special:homework", field: "homework", name: "作业", icon: "homework" },
    { id: "special:longterm", field: "longTerm", name: "长期事项", icon: "longterm" }
  ];
  const REVIEW_INTERVALS = [1, 3, 7, 15];
  const specialGroup = id => specialGroups.find(group => group.id === id);
  function readSpecialFields(prefix) { return Object.fromEntries(specialGroups.map(group => [group.field, $(`#${prefix}-${group.field}`).checked])); }
  function resetSpecialFields() { specialGroups.forEach(group => { $(`#task-${group.field}`).checked = activeGroup === group.id; }); }
  const dialog = $("#group-dialog");
  const groupInput = $("#group-name");
  const previewDialog = $("#task-preview-dialog");
  const previewGroup = $("#task-preview-group");
  const previewMeta = $("#task-preview-meta");
  const previewTitle = $("#task-preview-title");
  const previewContent = $("#task-preview-content");
  const previewBody = $(".task-preview-body");
  const previewHint = $("#task-preview-hint");
  const previewCopy = $("#task-preview-copy");
  const toggleCards = $("#toggle-cards");
  const toggleCompletedCards = $("#toggle-completed-cards");
  const reviewView = $("#review-view");
  const reviewChartHost = $("#review-chart");
  const reviewDueList = $("#review-due-list");
  const reviewEmpty = $("#review-empty");
  const reviewEmptyTitle = $("#review-empty-title");
  const reviewEmptyDescription = $("#review-empty-description");
  const reviewActiveCount = $("#review-active-count");
  const reviewDueCount = $("#review-due-count");
  const reviewCompleteCount = $("#review-complete-count");
  const reviewDueBadge = $("#review-due-badge");
  const focusView = $("#focus-view");
  const focusMinutesInput = $("#focus-minutes");
  const focusDurationDisplay = $("#focus-duration-display");
  const focusPresetButtons = [...document.querySelectorAll(".focus-presets [data-minutes]")];
  const focusStart = $("#focus-start");
  const focusFeedback = $("#focus-feedback");
  const focusSessionHint = $("#focus-session-hint");
  const focusTaskSelect = $("#focus-task");
  const focusTaskPreview = $("#focus-task-preview");
  const focusTaskPreviewGroup = $("#focus-task-preview-group");
  const focusTaskPreviewDue = $("#focus-task-preview-due");
  const focusTaskPreviewTitle = $("#focus-task-preview-title");
  const focusTaskPreviewContent = $("#focus-task-preview-content");
  const focusOverlay = $("#focus-overlay");
  const focusOverlayContent = $("#focus-overlay-content");
  const focusCountdown = $("#focus-countdown");
  const focusOverlayTotal = $("#focus-overlay-total");
  const focusOverlayProgress = $("#focus-overlay-progress");
  const focusOverlayTask = $("#focus-overlay-task");
  const focusOverlayTaskGroup = $("#focus-overlay-task-group");
  const focusOverlayTaskDue = $("#focus-overlay-task-due");
  const focusOverlayTaskTitle = $("#focus-overlay-task-title");
  const focusOverlayTaskContent = $("#focus-overlay-task-content");
  const focusReenter = $("#focus-reenter");
  const focusExit = $("#focus-exit");
  const focusExitLabel = $("#focus-exit-label");
  const focusHoldHint = $("#focus-hold-hint");
  const focusOverlayStatus = $("#focus-overlay-status");
  let state = { version: 2, modifiedAt: 0, groups: [], tasks: [], dailyTasks: [] };
  let activeGroup = "all";
  let workspaceView = "calendar";
  let draggingId = null;
  let composing = false;
  let localAvailable = false;
  let saveToken = "";
  let diskRevision = 0;
  let diskModifiedAt = 0;
  let diskState = null;
  let browserAvailable = true;
  let saving = false;
  let toastTimer;
  let editing = null;
  let previewTaskId = "";
  let previewSourceCard = null;
  let previewAnimation = null;
  let previewClosing = false;
  let copyFeedbackTimer = 0;
  let lastDragEndAt = 0;
  let reviewTodayKey = "";
  const FOCUS_MINUTES_KEY = "yijian.focusMinutes";
  const FOCUS_TASK_KEY = "yijian.focusTaskId";
  const FOCUS_MINUTES_DEFAULT = 25;
  const FOCUS_MINUTES_MIN = 1;
  const FOCUS_MINUTES_MAX = 180;
  const FOCUS_RING_LENGTH = 2 * Math.PI * 132;
  let focusMinutes = FOCUS_MINUTES_DEFAULT;
  let focusTaskId = "";
  let focusTaskSignature = "";
  let focusActive = false;
  let focusStartAt = 0;
  let focusEndAt = 0;
  let focusTotalMs = 0;
  let focusTickTimer = 0;
  let focusEscapeTimer = 0;
  let focusHoldTimer = 0;
  let focusWakeLock = null;
  let focusClickShieldUntil = 0;
  let urgentId = null;
  let urgentPaused = false;
  let urgentHovered = false;
  let prioritySignature = "";
  let dailyDate = "";
  const previewAnimations = new WeakMap();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  // Clip the frost to the visible workspace without changing sticky panel positioning.
  const pageFrost = document.createElement("div");
  pageFrost.className = "page-frost";
  pageFrost.setAttribute("aria-hidden", "true");
  pageFrost.hidden = true;
  document.body.append(pageFrost);
  let frostAnimation = null;
  const workspaceAnimations = new Set();
  let enteringWorkspace = null;
  const PAGE_TRANSITION_MS = 1200;
  const ELEMENT_ENTRANCE_MS = 600;
  let entranceFrame = 0;
  let lastPageKey = "";
  const currentWorkspace = () => $(workspaceView === "calendar" ? "#calendar-view" : workspaceView === "review" ? "#review-view" : workspaceView === "focus" ? "#focus-view" : "#todo-view");
  function positionWorkspaceFrost() {
    if (pageFrost.hidden) return;
    const rect = currentWorkspace().getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    Object.assign(pageFrost.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${Math.max(0, Math.min(innerWidth, rect.right) - left)}px`,
      height: `${Math.max(0, Math.min(innerHeight, rect.bottom) - top)}px`
    });
  }
  window.addEventListener("resize", positionWorkspaceFrost, { passive: true });
  window.addEventListener("scroll", positionWorkspaceFrost, { passive: true });
  function revealWorkspaceElements() {
    const root = currentWorkspace();
    const selector = ".task-card,.calendar-day,.calendar-agenda-item,.review-card,.review-stat,.focus-card,h1,h2,h3,p,button,input,textarea,select,label,legend,.eyebrow,.count-badge,.drag-caption,.input-caption>span,.board-footer>span,.pinned-footer,.calendar-legend,.calendar-weekdays>span,.calendar-view-label,.calendar-agenda-hint,.always-visible";
    const candidates = [...root.querySelectorAll(selector)];
    const selected = new Set(candidates);
    const elements = candidates.filter(node => {
      if (node.closest("[hidden],.reveal-pending,.is-leaving")) return false;
      for (let parent = node.parentElement; parent !== root; parent = parent.parentElement) if (selected.has(parent)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    }).map(node => ({ node, rect: node.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    // Use visual rows so every element settles before the workspace transition ends.
    const rows = [];
    for (const item of elements) {
      if (!rows.length || item.rect.top - rows.at(-1) > 8) rows.push(item.rect.top);
      item.row = rows.length - 1;
    }
    for (const { node, row } of elements) {
      const animation = node.animate([
        { opacity: 0, translate: "0 12px" },
        { opacity: 1, translate: "0 0" }
      ], { duration: ELEMENT_ENTRANCE_MS, delay: rows.length > 1 ? row / (rows.length - 1) * (PAGE_TRANSITION_MS - ELEMENT_ENTRANCE_MS) : 0, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
      workspaceAnimations.add(animation);
      animation.finished.then(() => { animation.cancel(); workspaceAnimations.delete(animation); }).catch(() => {});
    }
  }
  function clearPageTransition() {
    cancelAnimationFrame(entranceFrame);
    workspaceAnimations.forEach(animation => animation.cancel());
    workspaceAnimations.clear();
    enteringWorkspace?.classList.remove("is-workspace-entering");
    enteringWorkspace = null;
    frostAnimation?.cancel();
    frostAnimation = null;
    pageFrost.hidden = true;
  }
  function playPageTransition() {
    clearPageTransition();
    if (reducedMotion.matches) return;
    enteringWorkspace = currentWorkspace();
    enteringWorkspace.classList.add("workspace-motion-managed");
    enteringWorkspace.classList.add("is-workspace-entering");
    pageFrost.hidden = false;
    positionWorkspaceFrost();
    const animation = pageFrost.animate([
      { backdropFilter: "blur(14px)", opacity: 1 },
      { backdropFilter: "blur(0px)", opacity: 0 }
    ], { duration: PAGE_TRANSITION_MS, easing: "cubic-bezier(.22,.61,.36,1)" });
    frostAnimation = animation;
    entranceFrame = requestAnimationFrame(() => {
      positionWorkspaceFrost();
      revealWorkspaceElements();
    });
    animation.finished.then(() => {
      if (frostAnimation === animation) clearPageTransition();
    }).catch(() => { /* A newer navigation replaces the previous transition. */ });
  }
  reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) clearPageTransition(); });
  const previewObserver = new ResizeObserver(entries => entries.forEach(entry => animatePreview(entry.target)));
  const CARD_RATIOS = [0.8, 0.95, 1, 1.15, 1.3, 1.45];
  function cardRatio(id) {
    let hash = 0;
    for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    return CARD_RATIOS[hash % CARD_RATIOS.length];
  }
  function layoutCard(card) {
    if (!card.isConnected) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    card.style.marginBottom = `${gap}px`;
    card.style.gridRowEnd = `span ${Math.max(1, Math.ceil(card.offsetHeight + gap))}`;
  }
  const masonryObserver = new ResizeObserver(entries => entries.forEach(entry => layoutCard(entry.target)));
  let lastScrollY = window.scrollY;
  let scrollingUp = false;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (y !== lastScrollY) { scrollingUp = y < lastScrollY; lastScrollY = y; }
  }, { passive: true });
  window.addEventListener("resize", () => { list.querySelectorAll(".task-card").forEach(layoutCard); });
  function revealInstant(card) {
    card.style.transition = "none";
    card.classList.replace("reveal-pending", "is-revealed");
    void card.offsetHeight;
    card.style.removeProperty("transition");
  }
  function resetReveal(card) {
    if (!card.isConnected || !card.classList.contains("is-revealed")) return;
    card.style.transition = "none";
    card.classList.replace("is-revealed", "reveal-pending");
    card.style.removeProperty("--reveal-delay");
    void card.offsetHeight;
    card.style.removeProperty("transition");
  }
  const revealObserver = new IntersectionObserver(entries => {
    let batch = 0;
    for (const entry of entries) {
      const card = entry.target;
      if (!entry.isIntersecting || !card.classList.contains("reveal-pending")) continue;
      // 只有向下滚动、卡片从画面底部进入时才做模糊展开；向上滚动从顶部进入时直接清晰。
      if (scrollingUp || entry.boundingClientRect.top < 0) { revealInstant(card); continue; }
      card.style.setProperty("--reveal-delay", `${Math.min(batch++, 6) * 80}ms`);
      card.classList.replace("reveal-pending", "is-revealed");
      card.addEventListener("transitionend", () => card.style.removeProperty("--reveal-delay"), { once: true });
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  const rearmObserver = new IntersectionObserver(entries => {
    if (reducedMotion.matches) return;
    for (const entry of entries) {
      // 完全从下方离开视野后重新进入待展开状态；从顶部离开的卡片继续保持清晰。
      if (!entry.isIntersecting && entry.boundingClientRect.top >= 0) resetReveal(entry.target);
    }
  }, { threshold: 0 });
  const THEME_KEY = "yijian.theme";
  const themeButton = $("#theme-toggle");
  const systemDark = matchMedia("(prefers-color-scheme: dark)");
  function savedTheme() {
    try { const value = localStorage.getItem(THEME_KEY); return value === "dark" || value === "light" ? value : null; } catch { return null; }
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeButton.setAttribute("aria-pressed", String(theme === "dark"));
    const label = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    themeButton.title = label;
    themeButton.setAttribute("aria-label", label);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#14181f" : "#0078d4";
  }
  applyTheme(savedTheme() || (systemDark.matches ? "dark" : "light"));
  themeButton.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch { /* 存储不可用时仅本次页面生效 */ }
    applyTheme(next);
    playPageTransition();
  });
  systemDark.addEventListener("change", event => { if (!savedTheme()) applyTheme(event.matches ? "dark" : "light"); });

  const BACKGROUND_KEY = "yijian.background.v1";
  const BACKGROUND_BLUR_KEY = "yijian.backgroundBlur.v1";
  const CARD_BLUR_KEY = "yijian.cardBlur.v1";
  const LEGACY_CARD_BLUR_KEY = "yijian.cardBlurBoost";
  const CARD_TRANSPARENCY_KEY = "yijian.cardTransparency.v1";
  const BACKGROUND_HINT = "图片仅保存在当前浏览器，不会写入待办文件。";
  const BACKGROUND_BLUR_DEFAULT = 20;
  const BACKGROUND_BLUR_MAX = 40;
  const CARD_BLUR_DEFAULT = 26;
  const CARD_BLUR_MIN = 0;
  const CARD_BLUR_MAX = 80;
  const LEGACY_CARD_BLUR_BOOST = 14;
  const CARD_TRANSPARENCY_DEFAULT = 38;
  const CARD_TRANSPARENCY_MIN = 0;
  const CARD_TRANSPARENCY_MAX = 80;
  const CARD_TRANSPARENCY_BASE = 100 - CARD_TRANSPARENCY_DEFAULT;
  const backgroundButton = $("#background-button");
  const backgroundDialog = $("#background-dialog");
  const backgroundPreview = $("#background-preview");
  const backgroundPreviewImage = $("#background-preview-image");
  const backgroundFile = $("#background-file");
  const backgroundStatus = $("#background-status");
  const backgroundRemove = $("#background-remove");
  const backgroundBlurControl = $("#background-blur-control");
  const backgroundBlurInput = $("#background-blur");
  const backgroundBlurValue = $("#background-blur-value");
  const cardBlurInput = $("#card-blur");
  const cardBlurValue = $("#card-blur-value");
  const cardTransparencyInput = $("#card-transparency");
  const cardTransparencyValue = $("#card-transparency-value");
  let backgroundImage = "";
  let backgroundBlur = BACKGROUND_BLUR_DEFAULT;
  let cardBlur = CARD_BLUR_DEFAULT;
  let cardTransparency = CARD_TRANSPARENCY_DEFAULT;
  const validBackground = value => typeof value === "string" && value.length < 4000000 && /^data:image\/(?:webp|jpeg|png);base64,[a-z0-9+/=]+$/i.test(value);
  const normalizeBackgroundBlur = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(BACKGROUND_BLUR_MAX, Math.max(0, Math.round(number / 2) * 2)) : BACKGROUND_BLUR_DEFAULT;
  };
  const normalizeCardBlur = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(CARD_BLUR_MAX, Math.max(CARD_BLUR_MIN, Math.round(number / 2) * 2)) : CARD_BLUR_DEFAULT;
  };
  const normalizeCardTransparency = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(CARD_TRANSPARENCY_MAX, Math.max(CARD_TRANSPARENCY_MIN, Math.round(number / 2) * 2)) : CARD_TRANSPARENCY_DEFAULT;
  };
  function readCardBlurSetting() {
    try {
      const raw = localStorage.getItem(CARD_BLUR_KEY);
      if (raw !== null && raw !== "") return normalizeCardBlur(raw);
      const savedBackground = localStorage.getItem(BACKGROUND_KEY) || "";
      const savedBlur = localStorage.getItem(BACKGROUND_BLUR_KEY);
      const blur = savedBlur === null || savedBlur === "" ? BACKGROUND_BLUR_DEFAULT : normalizeBackgroundBlur(savedBlur);
      const base = validBackground(savedBackground) ? Math.max(26, blur + 6) : 26;
      const legacyBoost = localStorage.getItem(LEGACY_CARD_BLUR_KEY) === "1" ? LEGACY_CARD_BLUR_BOOST : 0;
      const initial = normalizeCardBlur(base + legacyBoost);
      try { localStorage.setItem(CARD_BLUR_KEY, String(initial)); } catch { /* 存储不可用时仅本次生效 */ }
      return initial;
    } catch { return CARD_BLUR_DEFAULT; }
  }
  function readCardTransparencySetting() {
    try {
      const raw = localStorage.getItem(CARD_TRANSPARENCY_KEY);
      return raw === null || raw === "" ? CARD_TRANSPARENCY_DEFAULT : normalizeCardTransparency(raw);
    } catch { return CARD_TRANSPARENCY_DEFAULT; }
  }
  function syncBackgroundBlur() {
    const active = Boolean(backgroundImage);
    backgroundBlurInput.disabled = !active;
    backgroundBlurControl.classList.toggle("is-disabled", !active);
    backgroundBlurInput.value = String(backgroundBlur);
    backgroundBlurValue.textContent = `${backgroundBlur} px`;
    cardBlurInput.value = String(cardBlur);
    cardBlurValue.textContent = `${cardBlur} px`;
    if (active) document.documentElement.style.setProperty("--bg-blur", `${backgroundBlur}px`);
    else document.documentElement.style.removeProperty("--bg-blur");
    if (active || cardBlur !== CARD_BLUR_DEFAULT) document.documentElement.style.setProperty("--card-blur", `${cardBlur}px`);
    else document.documentElement.style.removeProperty("--card-blur");
  }
  function syncCardTransparency() {
    const alphaScale = (100 - cardTransparency) / CARD_TRANSPARENCY_BASE;
    const gradientScale = Math.min(1, alphaScale);
    cardTransparencyInput.value = String(cardTransparency);
    cardTransparencyValue.textContent = `${cardTransparency}%`;
    document.documentElement.style.setProperty("--card-alpha-scale", alphaScale.toFixed(4));
    document.documentElement.style.setProperty("--card-gradient-scale", gradientScale.toFixed(4));
  }
  function applyBackground(image) {
    backgroundImage = validBackground(image) ? image : "";
    if (backgroundImage) {
      document.documentElement.dataset.background = "custom";
      document.documentElement.style.setProperty("--custom-bg-image", `url("${backgroundImage}")`);
    } else {
      delete document.documentElement.dataset.background;
      document.documentElement.style.removeProperty("--custom-bg-image");
    }
    backgroundButton.classList.toggle("is-active", Boolean(backgroundImage));
    const label = backgroundImage ? "更换自定义背景" : "自定义背景";
    backgroundButton.title = label;
    backgroundButton.setAttribute("aria-label", label);
    backgroundPreview.classList.toggle("has-image", Boolean(backgroundImage));
    if (backgroundImage) backgroundPreviewImage.src = backgroundImage;
    else backgroundPreviewImage.removeAttribute("src");
    backgroundRemove.disabled = !backgroundImage;
    syncBackgroundBlur();
  }
  function readBackground() {
    let saved = "", savedBlur = null;
    try {
      saved = localStorage.getItem(BACKGROUND_KEY) || "";
      savedBlur = localStorage.getItem(BACKGROUND_BLUR_KEY);
    } catch { /* 存储不可用时只使用默认背景 */ }
    backgroundBlur = savedBlur === null || savedBlur === "" ? BACKGROUND_BLUR_DEFAULT : normalizeBackgroundBlur(savedBlur);
    applyBackground(saved);
  }
  function loadBackgroundImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("无法读取这张图片，请换一张试试"));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("无法读取这张图片，请换一张试试"));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function encodeBackground(image, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", quality);
  }
  async function setBackgroundFromFile(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("请选择图片文件");
    if (file.size > 30 * 1024 * 1024) throw new Error("图片超过 30MB，请换一张更小的图片");
    const image = await loadBackgroundImage(file);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片尺寸无效，请换一张试试");
    let encoded = encodeBackground(image, 2200, .84);
    if (encoded.length >= 3000000) encoded = encodeBackground(image, 1600, .74);
    if (encoded.length >= 3000000) encoded = encodeBackground(image, 1280, .66);
    if (encoded.length >= 3000000) throw new Error("图片压缩后仍然较大，请换一张更小的图片");
    try { localStorage.setItem(BACKGROUND_KEY, encoded); }
    catch { throw new Error("浏览器存储空间不足，背景未保存，请换一张更小的图片"); }
    applyBackground(encoded);
  }
  backgroundButton.addEventListener("click", () => {
    if (backgroundDialog.open) return;
    backgroundStatus.classList.remove("is-error");
    backgroundStatus.textContent = backgroundImage ? "背景已保存在当前浏览器，可随时更换或移除。" : BACKGROUND_HINT;
    backgroundDialog.showModal();
  });
  $("#background-close").addEventListener("click", () => backgroundDialog.close());
  $("#background-done").addEventListener("click", () => backgroundDialog.close());
  backgroundDialog.addEventListener("close", () => backgroundButton.focus({ preventScroll: true }));
  $("#background-pick").addEventListener("click", () => backgroundFile.click());
  backgroundFile.addEventListener("change", async () => {
    const file = backgroundFile.files?.[0];
    backgroundFile.value = "";
    if (!file) return;
    const pick = $("#background-pick");
    pick.disabled = true;
    backgroundStatus.classList.remove("is-error");
    backgroundStatus.textContent = "正在压缩图片…";
    try {
      await setBackgroundFromFile(file);
      backgroundStatus.textContent = "背景已更新，可调节下方磨砂强度。";
      notify("已应用自定义背景");
    } catch (error) {
      backgroundStatus.textContent = error.message;
      backgroundStatus.classList.add("is-error");
    } finally {
      pick.disabled = false;
    }
  });
  backgroundBlurInput.addEventListener("input", () => {
    backgroundBlur = normalizeBackgroundBlur(backgroundBlurInput.value);
    syncBackgroundBlur();
    try { localStorage.setItem(BACKGROUND_BLUR_KEY, String(backgroundBlur)); } catch { /* 存储不可用时仅本次页面生效 */ }
  });
  backgroundRemove.addEventListener("click", () => {
    try { localStorage.removeItem(BACKGROUND_KEY); } catch { /* 存储不可用时仅本次页面移除 */ }
    applyBackground("");
    backgroundStatus.classList.remove("is-error");
    backgroundStatus.textContent = "已恢复默认背景。";
    notify("已移除自定义背景");
  });
  cardBlurInput.addEventListener("input", () => {
    cardBlur = normalizeCardBlur(cardBlurInput.value);
    try { localStorage.setItem(CARD_BLUR_KEY, String(cardBlur)); } catch { /* 存储不可用时仅本次页面生效 */ }
    syncBackgroundBlur();
  });
  cardTransparencyInput.addEventListener("input", () => {
    cardTransparency = normalizeCardTransparency(cardTransparencyInput.value);
    try { localStorage.setItem(CARD_TRANSPARENCY_KEY, String(cardTransparency)); } catch { /* 存储不可用时仅本次页面生效 */ }
    syncCardTransparency();
  });
  cardBlur = readCardBlurSetting();
  cardTransparency = readCardTransparencySetting();
  readBackground();
  syncCardTransparency();

  function animatePreview(preview) {
    previewAnimations.get(preview)?.cancel();
    previewAnimations.delete(preview);
    if (!preview.isConnected) return;
    const track = preview.firstElementChild;
    const text = track.firstElementChild;
    const copy = track.lastElementChild;
    const distance = text.getBoundingClientRect().width + 28;
    const overflowing = text.getBoundingClientRect().width > preview.clientWidth + 1;
    copy.hidden = !overflowing || reducedMotion.matches;
    preview.classList.toggle("is-scrolling", overflowing && !reducedMotion.matches);
    if (!overflowing || reducedMotion.matches) return;
    const animation = track.animate([
      { transform: "translateX(0)", offset: 0 },
      { transform: "translateX(0)", offset: .08 },
      { transform: `translateX(-${distance}px)`, offset: 1 }
    ], { duration: Math.max(8000, distance / 28 * 1000), iterations: Infinity, easing: "linear" });
    previewAnimations.set(preview, animation);
    if (preview.matches(":hover") || preview.contains(document.activeElement)) animation.pause();
  }
  function collapsedPreview(content) {
    const text = content.replace(/\s+/g, " ").trim();
    const preview = element("div", "collapsed-preview");
    preview.tabIndex = 0;
    preview.title = text;
    preview.setAttribute("role", "group");
    preview.setAttribute("aria-label", `待办内容：${text}`);
    const track = element("span", "collapsed-preview-track");
    const primary = element("span", "collapsed-preview-text", text);
    const copy = element("span", "collapsed-preview-copy", text);
    copy.setAttribute("aria-hidden", "true");
    copy.hidden = true;
    track.append(primary, copy);
    preview.append(track);
    const updatePlayback = () => {
      const animation = previewAnimations.get(preview);
      if (!animation) return;
      if (preview.matches(":hover") || preview.contains(document.activeElement)) animation.pause();
      else animation.play();
    };
    for (const event of ["mouseenter", "mouseleave", "focusin", "focusout"]) preview.addEventListener(event, updatePlayback);
    return preview;
  }
  function releasePreviews(root) {
    root.querySelectorAll(".collapsed-preview").forEach(preview => {
      previewObserver.unobserve(preview);
      previewAnimations.get(preview)?.cancel();
      previewAnimations.delete(preview);
    });
  }
  function replaceCards(root, cards) {
    releasePreviews(root);
    if (root === list) root.querySelectorAll(".task-card").forEach(card => { masonryObserver.unobserve(card); revealObserver.unobserve(card); rearmObserver.unobserve(card); });
    root.replaceChildren(...cards);
    root.querySelectorAll(".collapsed-preview").forEach(preview => previewObserver.observe(preview));
    if (root === list) cards.forEach(card => {
      layoutCard(card);
      masonryObserver.observe(card);
      revealObserver.observe(card);
      rearmObserver.observe(card);
      if (!card.classList.contains("reveal-pending")) return;
      // 渲染时已经在画面里（首屏或重渲染）的卡片直接清晰显示，模糊只留给向下滚动进入的卡片。
      if (card.getBoundingClientRect().top < window.innerHeight) revealInstant(card);
    });
  }
  function landCard(root, id) {
    if (reducedMotion.matches) return;
    const card = [...root.children].find(item => item.dataset.id === id);
    if (!card) return;
    card.classList.add("is-landing");
    card.addEventListener("animationend", event => {
      if (event.animationName === "card-land-spring") card.classList.remove("is-landing");
    }, { once: true });
  }
  reducedMotion.addEventListener("change", () => {
    document.querySelectorAll(".collapsed-preview").forEach(animatePreview);
    if (reducedMotion.matches) document.querySelectorAll("#task-list .reveal-pending").forEach(card => {
      card.style.removeProperty("--reveal-delay");
      revealInstant(card);
    });
    else list.querySelectorAll(".task-card").forEach(card => {
      if (card.getBoundingClientRect().top >= window.innerHeight) resetReveal(card);
    });
  });

  function notify(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").classList.add("visible");
    toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
  }
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const validTime = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
  function normalize(raw) {
    if (!raw || raw.version !== 2 || !Array.isArray(raw.groups) || !Array.isArray(raw.tasks)) throw new Error("保存数据格式不正确");
    const groups = [];
    const groupIds = new Set();
    const names = new Set();
    for (const group of raw.groups) {
      if (!group || typeof group.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(group.id) || !validGroupName(group.name) || groupIds.has(group.id) || names.has(group.name.toLowerCase())) continue;
      groups.push({ id: group.id, name: group.name });
      groupIds.add(group.id);
      names.add(group.name.toLowerCase());
    }
    const ids = new Set();
    const tasks = raw.tasks.filter(task => {
      if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(task.id) || ids.has(task.id) || typeof task.title !== "string" || (task.content !== undefined && typeof task.content !== "string") || !(task.title.trim() || task.content?.trim()) || !validTime(task.createdAt)) return false;
      ids.add(task.id);
      return true;
    }).map(task => {
      const completed = task.completed === true;
      const reviews = completed && Array.isArray(task.reviews) && task.reviews.length === 4 && task.reviews.every(validTime) ? task.reviews.slice() : [0, 0, 0, 0];
      return { id: task.id, title: task.content === undefined ? "" : task.title.trim().slice(0, 120), content: (task.content === undefined ? task.title : task.content).trim().slice(0, 5000), collapsed: task.collapsed === true, dueDate: rules.validDueDate(task.dueDate) ? task.dueDate : null, priority: task.priority === "urgent" ? "urgent" : "normal", homework: task.homework === true, longTerm: task.longTerm === true, completed, completedAt: completed && validTime(task.completedAt) ? task.completedAt : 0, reviews, createdAt: task.createdAt, pinnedAt: validTime(task.pinnedAt) ? task.pinnedAt : 0, groupId: groupIds.has(task.groupId) ? task.groupId : null };
    });
    const dailyIds = new Set();
    const dailyTasks = (Array.isArray(raw.dailyTasks) ? raw.dailyTasks : []).filter(task => {
      if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(task.id) || dailyIds.has(task.id) || typeof task.title !== "string" || !task.title.trim()) return false;
      dailyIds.add(task.id);
      return true;
    }).slice(0, 500).map(task => ({ id: task.id, title: task.title.trim().slice(0, 200), completedOn: rules.validDueDate(task.completedOn) ? task.completedOn : null }));
    return { version: 2, modifiedAt: validTime(raw.modifiedAt) ? raw.modifiedAt : Date.now(), groups, tasks, dailyTasks };
  }
  function validGroupName(name) {
    return typeof name === "string" && name.length > 0 && name.length <= 60 && name === name.trim() && !/[<>:"/\\|?*\u0000-\u001f]/.test(name) && !/[. ]$/.test(name) && !/^\./.test(name) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) && !["全部待办", "未分组"].includes(name);
  }
  function readBrowser() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) state = normalize(JSON.parse(saved));
      else {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
        if (Array.isArray(legacy) && legacy.length) state = normalize({ version: 2, modifiedAt: Date.now(), groups: [], tasks: legacy });
      }
    } catch {
      browserAvailable = false;
      notify("浏览器保存不可用，请使用本地保存");
    }
  }
  function writeBrowser() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      browserAvailable = true;
    } catch { browserAvailable = false; }
  }
  const SAVE_CHANGE_LIMIT = 30;
  const cloneWorkspace = value => JSON.parse(JSON.stringify(value));
  const emptyWorkspace = () => ({ version: 2, modifiedAt: 0, groups: [], tasks: [], dailyTasks: [] });
  function saveChangeLabel(task) {
    const label = (task.title || (task.content || "").split(/\r?\n/)[0] || "").replace(/\s+/g, " ").trim();
    return label.length > 32 ? `${label.slice(0, 32)}…` : label || "（无标题）";
  }
  function groupLabelOf(workspace, groupId) {
    return workspace.groups.find(group => group.id === groupId)?.name || "未分组";
  }
  function collectSaveChanges() {
    if (!diskState) return [];
    const changes = [];
    const groupsBefore = new Map(diskState.groups.map(group => [group.id, group]));
    const groupsAfter = new Map(state.groups.map(group => [group.id, group]));
    for (const group of state.groups) {
      const before = groupsBefore.get(group.id);
      if (!before) changes.push({ kind: "add", text: `新建分组「${group.name}」` });
      else if (before.name !== group.name) changes.push({ kind: "update", text: `分组「${before.name}」重命名为「${group.name}」` });
    }
    for (const group of diskState.groups) if (!groupsAfter.has(group.id)) changes.push({ kind: "remove", text: `删除分组「${group.name}」` });

    const tasksBefore = new Map(diskState.tasks.map(task => [task.id, task]));
    const tasksAfter = new Map(state.tasks.map(task => [task.id, task]));
    for (const task of state.tasks) {
      const before = tasksBefore.get(task.id);
      const label = saveChangeLabel(task);
      if (!before) { changes.push({ kind: "add", text: `新增待办「${label}」` }); continue; }
      if (before.completed !== task.completed) changes.push({ kind: task.completed ? "complete" : "update", text: `${task.completed ? "完成" : "取消完成"}待办「${label}」` });
      if (before.groupId !== task.groupId) changes.push({ kind: "update", text: `移动待办「${label}」：${groupLabelOf(diskState, before.groupId)} → ${groupLabelOf(state, task.groupId)}` });
      if (before.pinnedAt !== task.pinnedAt) changes.push({ kind: "update", text: `${task.pinnedAt ? "置顶" : "取消置顶"}待办「${label}」` });
      const fields = [];
      if (before.title !== task.title) fields.push("标题");
      if (before.content !== task.content) fields.push("正文");
      if (before.dueDate !== task.dueDate) fields.push(task.dueDate ? `截止日期改为 ${task.dueDate}` : "清除截止日期");
      if (before.priority !== task.priority) fields.push(`优先级改为${task.priority === "urgent" ? "紧迫" : "一般"}`);
      if (before.homework !== task.homework) fields.push(task.homework ? "加入作业" : "移出作业");
      if (before.longTerm !== task.longTerm) fields.push(task.longTerm ? "标为长期事项" : "取消长期事项");
      if (before.collapsed !== task.collapsed) fields.push(task.collapsed ? "折叠卡片" : "展开卡片");
      if (!before.reviews || before.reviews.some((value, index) => value !== task.reviews[index])) fields.push("艾宾浩斯复习打卡");
      if (fields.length) changes.push({ kind: "update", text: `修改待办「${label}」：${fields.join("、")}` });
    }
    for (const task of diskState.tasks) if (!tasksAfter.has(task.id)) changes.push({ kind: "remove", text: `删除待办「${saveChangeLabel(task)}」` });

    const dailyBefore = new Map(diskState.dailyTasks.map(task => [task.id, task]));
    const dailyAfter = new Map(state.dailyTasks.map(task => [task.id, task]));
    for (const task of state.dailyTasks) {
      const before = dailyBefore.get(task.id);
      const label = saveChangeLabel(task);
      if (!before) { changes.push({ kind: "add", text: `新增每日任务「${label}」` }); continue; }
      const fields = [];
      if (before.title !== task.title) fields.push("文字");
      if (before.completedOn !== task.completedOn) fields.push(task.completedOn ? "今日已勾选" : "取消今日勾选");
      if (fields.length) changes.push({ kind: "update", text: `修改每日任务「${label}」：${fields.join("、")}` });
    }
    for (const task of diskState.dailyTasks) if (!dailyAfter.has(task.id)) changes.push({ kind: "remove", text: `删除每日任务「${saveChangeLabel(task)}」` });
    return changes;
  }
  function updateSaveStatus() {
    const status = $("#save-status");
    const localChanges = localAvailable && !saving && diskState ? collectSaveChanges() : [];
    const hasLocalChanges = localChanges.length > 0;
    const statusText = saving ? "正在保存…" : !browserAvailable ? "浏览器保存不可用" : localAvailable ? (hasLocalChanges ? "有待保存的更改" : "已保存到本地") : "浏览器自动保存";
    status.textContent = statusText;
    const pending = statusText === "有待保存的更改";
    const changes = pending ? localChanges : [];
    const popover = $("#save-changes-popover");
    const hasChanges = changes.length > 0;
    status.dataset.pending = String(hasChanges);
    if (hasChanges) {
      status.tabIndex = 0;
      status.setAttribute("aria-describedby", "save-changes-popover");
      $("#save-changes-count").textContent = `${changes.length} 项`;
      const items = changes.slice(0, SAVE_CHANGE_LIMIT).map(change => element("li", `save-change-${change.kind}`, change.text));
      if (changes.length > SAVE_CHANGE_LIMIT) items.push(element("li", "save-change-more", `另有 ${changes.length - SAVE_CHANGE_LIMIT} 项更改未展开`));
      $("#save-changes-list").replaceChildren(...items);
      popover.hidden = false;
    } else {
      status.removeAttribute("tabindex");
      status.removeAttribute("aria-describedby");
      $("#save-changes-list").replaceChildren();
      popover.hidden = true;
    }
    $("#daily-save").disabled = saving;
  }
  function commit(message, focusTarget) {
    state.modifiedAt = Math.max(Date.now(), state.modifiedAt + 1);
    writeBrowser();
    render(focusTarget);
    if (message) notify(message);
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(action, label, iconName) {
    const node = element("button", `icon-button ${action}-button`);
    node.type = "button";
    node.dataset.action = action;
    node.title = label;
    node.setAttribute("aria-label", label);
    node.append(icon(iconName));
    return node;
  }
  function groupName(groupId) { return state.groups.find(group => group.id === groupId)?.name || "未分组"; }
  function parseText(heading, rawContent) {
    let title = heading.trim();
    let content = rawContent.trim();
    // The first **…** span, or text after ** until the line ends, becomes the title.
    const marker = /\*\*([^\r\n]*?)(?:\*\*|(?=\r?\n|$))/.exec(content);
    if (marker && marker[1].trim()) {
      const replacement = title ? marker[1] : "";
      if (!title) title = marker[1].trim();
      content = `${content.slice(0, marker.index)}${replacement}${content.slice(marker.index + marker[0].length)}`.trim();
    }
    return { title, content };
  }
  function taskLabel(task) { return task.title || task.content.split(/\r?\n/)[0]; }
  function visibleTaskCards() {
    return [...document.querySelectorAll("#task-list .task-card, #completed-list .task-card, #pinned-list .task-card, #urgent-list .task-card")]
      .filter(card => !card.classList.contains("is-leaving") && card.getClientRects().length > 0);
  }
  function cardToggleState() {
    const cards = visibleTaskCards();
    const tasks = [...new Set(cards.map(card => card.dataset.id))]
      .map(id => state.tasks.find(task => task.id === id))
      .filter(Boolean);
    return { tasks, allCollapsed: tasks.length > 0 && tasks.every(task => task.collapsed) };
  }
  function syncCardsToggles() {
    const doneView = activeGroup === "done";
    const { tasks, allCollapsed } = cardToggleState();
    const action = allCollapsed ? "expand" : "collapse";
    const label = action === "expand" ? "全部展开" : "全部折叠";
    const ariaLabel = action === "expand" ? "展开全部卡片" : "折叠全部卡片";
    const title = action === "expand" ? "一键展开当前页的所有卡片" : "一键折叠当前页的所有卡片";
    for (const button of [toggleCards, toggleCompletedCards]) {
      button.dataset.action = action;
      button.querySelector("span").textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      button.title = title;
      button.disabled = tasks.length === 0;
    }
    toggleCards.hidden = doneView || tasks.length === 0;
    toggleCompletedCards.hidden = !doneView || tasks.length === 0;
  }
  function toggleAllCards() {
    const { tasks, allCollapsed } = cardToggleState();
    if (!tasks.length) return;
    for (const task of tasks) task.collapsed = !allCollapsed;
    commit(allCollapsed ? "已展开全部卡片" : "已折叠全部卡片");
  }
  for (const button of [toggleCards, toggleCompletedCards]) button.addEventListener("click", toggleAllCards);
  function rootFor(area) { return area === "urgent" ? urgentList : area === "pinned" ? pinnedList : area === "completed" ? completedList : list; }
  function urgentTasks() {
    return state.tasks.filter(task => !task.completed && rules.isUrgent(task)).sort((a, b) => (rules.deadline(a) ?? Infinity) - (rules.deadline(b) ?? Infinity) || b.createdAt - a.createdAt);
  }
  function getPrioritySignature() { return state.tasks.map(task => `${task.id}:${rules.isUrgent(task)}:${rules.urgentReason(task)}:${dueTier(task)}`).join("|"); }
  let urgentSlide = null;
  function settleUrgentSlide() {
    const slide = urgentSlide;
    if (!slide) return;
    urgentSlide = null;
    slide.animations.forEach(animation => animation.cancel());
    releasePreviews(slide.outgoing);
    slide.outgoing.remove();
    slide.incoming.style.removeProperty("grid-area");
    urgentList.style.removeProperty("height");
  }
  function renderUrgent(animate = false, direction = 1) {
    const tasks = urgentTasks();
    let index = tasks.findIndex(task => task.id === urgentId);
    if (index < 0) index = 0;
    urgentId = tasks[index]?.id || null;
    settleUrgentSlide();
    const cards = tasks.length ? [taskCard(tasks[index], "urgent")] : [];
    const previous = urgentList.firstElementChild;
    if (animate && cards.length && previous && previous.dataset.id !== urgentId && !reducedMotion.matches) {
      // 非线性缓动的双卡滑动：旧卡片滑出、新卡片滑入，同时进行。
      const incoming = cards[0];
      const easing = "cubic-bezier(0.65, 0, 0.35, 1)";
      const duration = 520;
      const oldHeight = previous.offsetHeight;
      previous.classList.add("is-leaving");
      previous.setAttribute("aria-hidden", "true");
      previous.style.gridArea = "1 / 1";
      incoming.style.gridArea = "1 / 1";
      urgentList.append(incoming);
      incoming.querySelectorAll(".collapsed-preview").forEach(preview => previewObserver.observe(preview));
      const newHeight = incoming.offsetHeight;
      const animations = [
        incoming.animate([{ transform: `translateX(${direction > 0 ? "100%" : "-100%"})`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration, easing }),
        previous.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${direction > 0 ? "-100%" : "100%"})`, opacity: 0 }], { duration, easing, fill: "forwards" })
      ];
      if (oldHeight !== newHeight) {
        urgentList.style.height = `${oldHeight}px`;
        animations.push(urgentList.animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], { duration, easing, fill: "forwards" }));
      }
      const slide = { incoming, outgoing: previous, animations };
      urgentSlide = slide;
      const finish = () => { if (urgentSlide === slide) settleUrgentSlide(); };
      animations[0].onfinish = finish;
      animations[0].oncancel = finish;
    } else {
      replaceCards(urgentList, cards);
    }
    $("#urgent-count").textContent = String(tasks.length);
    $("#urgent-empty").hidden = tasks.length > 0;
    $("#urgent-controls").hidden = tasks.length < 2;
    $("#urgent-pause").hidden = tasks.length < 2;
    $("#urgent-pause").textContent = urgentPaused ? "继续轮播" : "暂停轮播";
    $("#urgent-pause").setAttribute("aria-pressed", String(urgentPaused));
    $("#urgent-position").textContent = tasks.length ? `${index + 1} / ${tasks.length}` : "0 / 0";
  }
  function advanceUrgent(direction) {
    const tasks = urgentTasks();
    if (tasks.length < 2) return;
    const index = Math.max(0, tasks.findIndex(task => task.id === urgentId));
    urgentId = tasks[(index + direction + tasks.length) % tasks.length].id;
    renderUrgent(true, direction);
  }
  function folder(id, name, count, iconName) {
    const active = workspaceView === "todo" && activeGroup === id;
    const node = element("button", `folder-button${active ? " active" : ""}`);
    node.type = "button";
    node.dataset.groupId = id;
    node.setAttribute("aria-current", active ? "page" : "false");
    node.title = id === "all" ? "查看全部待办" : id === "done" ? "查看所有已完成的待办" : `${name} · 可将待办拖入此分组`;
    node.append(icon(iconName), element("span", "folder-name", name), element("span", "folder-count", count));
    return node;
  }
  function renderFolders() {
    $("#system-groups").replaceChildren(folder("all", "全部待办", state.tasks.filter(task => !task.longTerm).length, "grid"), folder("ungrouped", "未分组", state.tasks.filter(task => !task.groupId).length, "inbox"), ...specialGroups.map(group => folder(group.id, group.name, state.tasks.filter(task => task[group.field]).length, group.icon)), folder("done", "已完成", state.tasks.filter(task => task.completed).length, "check"));
    $("#custom-groups").replaceChildren(...state.groups.map(group => folder(group.id, group.name, state.tasks.filter(task => task.groupId === group.id).length, "folder")));
    $("#group-empty-hint").hidden = state.groups.length > 0;
  }
  function dueTier(task, now = Date.now()) {
    if (!rules.validDueDate(task.dueDate)) return 1;
    const current = new Date(now);
    const due = parseDateKey(task.dueDate);
    const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const gap = Math.round((due.getTime() - todayStart.getTime()) / 86400000);
    return gap <= 3 ? 3 : gap <= 7 ? 2 : 1;
  }
  function taskCard(task, area) {
    const urgent = !task.completed && rules.isUrgent(task);
    const tier = dueTier(task);
    const card = element("li", `task-card${task.pinnedAt ? " is-pinned" : ""}${task.completed ? " is-completed" : ""}${task.collapsed ? " is-collapsed" : ""}${urgent ? " is-urgent" : ""}${task.completed ? "" : ` due-tier-${tier}`}`);
    card.draggable = true;
    card.dataset.id = task.id;
    card.dataset.area = area;
    card.dataset.dueTier = String(tier);
    if (area === "main") {
      card.style.setProperty("--card-ratio", String(cardRatio(task.id)));
      if (!reducedMotion.matches) card.classList.add("reveal-pending");
      else card.classList.add("is-revealed");
    }
    const top = element("div", "card-top");
    const tag = element("div", "card-tag");
    tag.append(icon(task.groupId ? "folder" : "inbox"), element("span", "", groupName(task.groupId)));
    const grip = icon("grip");
    grip.classList.add("card-grip");
    const topActions = element("div", "card-top-actions");
    const fold = button("fold", `${task.collapsed ? "展开" : "折叠"}：${taskLabel(task)}`, "fold");
    const contentId = `task-content-${area}-${task.id}`;
    fold.setAttribute("aria-expanded", String(!task.collapsed));
    fold.setAttribute("aria-controls", contentId);
    topActions.append(grip, fold);
    top.append(tag, topActions);
    const metadata = element("div", "task-metadata");
    if (task.completed) metadata.append(element("span", "completed-badge", "已完成"));
    else {
      const badge = element("span", `priority-badge${urgent ? " urgent-badge" : ""}`, urgent ? "紧迫" : "一般");
      badge.title = urgent ? rules.urgentReason(task) : "一般优先级";
      metadata.append(badge);
    }
    for (const group of specialGroups) if (task[group.field]) metadata.append(element("span", "special-badge", group.name));
    if (task.dueDate) {
      const due = element("time", "due-date", `${task.dueDate.slice(5).replace("-", "/")} 截止`);
      due.dateTime = task.dueDate;
      due.title = `${task.dueDate} 23:59 截止`;
      if (!task.completed && rules.deadline(task) < Date.now()) due.textContent = `${task.dueDate.slice(5).replace("-", "/")} 已逾期`;
      metadata.append(due);
    }
    const content = element("div", "task-content");
    content.id = contentId;
    const title = element(task.title ? "h3" : "p", `task-title${task.title ? " has-heading" : ""}`, task.collapsed ? taskLabel(task) : task.title || task.content);
    content.append(title);
    if (task.title && task.content) {
      const description = element("p", "task-description", task.content);
      description.hidden = task.collapsed;
      content.append(description);
    }
    if (task.collapsed && task.content) content.append(collapsedPreview(task.content));
    const bottom = element("div", "card-bottom");
    const time = element("time", "task-time");
    time.dateTime = new Date(task.createdAt).toISOString();
    time.textContent = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(task.createdAt);
    time.title = new Date(task.createdAt).toLocaleString("zh-CN");
    const actions = element("div", "task-actions");
    const complete = element("button", "icon-button complete-button");
    complete.type = "button";
    complete.dataset.action = "complete";
    complete.title = `${task.completed ? "取消完成" : "完成"}：${taskLabel(task)}`;
    complete.setAttribute("aria-label", complete.title);
    complete.setAttribute("aria-pressed", String(Boolean(task.completed)));
    if (task.completed) {
      complete.classList.add("is-undo");
      complete.append(icon("undo"));
    } else {
      complete.textContent = "√";
    }
    const pin = button("pin", `${task.pinnedAt ? "取消置顶" : "置顶"}：${taskLabel(task)}`, "pin");
    pin.setAttribute("aria-pressed", String(Boolean(task.pinnedAt)));
    actions.append(button("edit", `编辑：${taskLabel(task)}`, "edit"), pin, button("delete", `删除：${taskLabel(task)}`, "trash"));
    const completeRow = element("div", "complete-row");
    completeRow.append(complete);
    const bottomRow = element("div", "card-bottom-row");
    bottomRow.append(time, actions);
    bottom.append(completeRow, bottomRow);
    const select = element("select", "move-select");
    select.setAttribute("aria-label", `移动分组：${taskLabel(task)}`);
    for (const group of [{ id: "", name: "未分组" }, ...state.groups]) {
      const option = element("option", "", `移动到：${group.name}`);
      option.value = group.id;
      select.append(option);
    }
    select.value = task.groupId || "";
    select.hidden = task.collapsed;
    card.append(top, metadata, content, bottom, select);
    return card;
  }
  function motionToken(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }
  function renderTaskPreview(task) {
    previewGroup.replaceChildren(icon(task.groupId ? "folder" : "inbox"), element("span", "", groupName(task.groupId)));
    previewMeta.replaceChildren();
    if (task.completed) previewMeta.append(element("span", "completed-badge", "已完成"));
    else {
      const urgent = rules.isUrgent(task);
      const badge = element("span", `priority-badge${urgent ? " urgent-badge" : ""}`, urgent ? "紧迫" : "一般");
      badge.title = urgent ? rules.urgentReason(task) : "一般优先级";
      previewMeta.append(badge);
    }
    for (const group of specialGroups) if (task[group.field]) previewMeta.append(element("span", "special-badge", group.name));
    if (task.dueDate) {
      const due = element("time", "due-date", `${task.dueDate.slice(5).replace("-", "/")} 截止`);
      due.dateTime = task.dueDate;
      due.title = `${task.dueDate} 23:59 截止`;
      if (!task.completed && rules.deadline(task) < Date.now()) due.textContent = `${task.dueDate.slice(5).replace("-", "/")} 已逾期`;
      previewMeta.append(due);
    }
    const created = element("span", "task-preview-created", `创建于 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(task.createdAt)}`);
    created.title = new Date(task.createdAt).toLocaleString("zh-CN");
    previewMeta.append(created);
    previewTitle.textContent = task.title;
    previewTitle.hidden = !task.title;
    previewContent.textContent = task.content;
    previewContent.hidden = !task.content;
    previewDialog.setAttribute("aria-label", `待办详情：${taskLabel(task)}`);
    previewCopy.textContent = "复制内容";
    previewCopy.classList.remove("is-copied");
    previewHint.textContent = "选中文字即可复制";
    clearTimeout(copyFeedbackTimer);
  }
  function openTaskPreview(task, card) {
    if (previewDialog.open) return;
    previewTaskId = task.id;
    previewSourceCard = card;
    previewClosing = false;
    previewDialog.classList.remove("is-closing");
    renderTaskPreview(task);
    previewDialog.showModal();
    previewBody.scrollTop = 0;
    if (reducedMotion.matches || !card?.isConnected) return;
    const cardRect = card.getBoundingClientRect();
    const panelRect = previewDialog.getBoundingClientRect();
    if (!cardRect.width || !panelRect.width || !panelRect.height) return;
    const dx = cardRect.left + cardRect.width / 2 - (panelRect.left + panelRect.width / 2);
    const dy = cardRect.top + cardRect.height / 2 - (panelRect.top + panelRect.height / 2);
    const sx = Math.max(.18, Math.min(1, cardRect.width / panelRect.width));
    const sy = Math.max(.18, Math.min(1, cardRect.height / panelRect.height));
    previewAnimation?.cancel();
    const animation = previewDialog.animate([
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, opacity: .35, filter: "blur(12px)" },
      { transform: `translate(${(dx * .08).toFixed(2)}px, ${(dy * .08).toFixed(2)}px) scale(${(sx + (1 - sx) * .9).toFixed(4)}, ${(sy + (1 - sy) * .9).toFixed(4)})`, opacity: 1, filter: "blur(0px)", offset: .72 },
      { transform: "translate(0, 0) scale(1.012, 1.012)", opacity: 1, filter: "blur(0px)", offset: .88 },
      { transform: "translate(0, 0) scale(1, 1)", opacity: 1, filter: "blur(0px)" }
    ], { duration: 480, easing: motionToken("--spring-soft", "cubic-bezier(.22,1.18,.34,1)") });
    previewAnimation = animation;
    animation.finished.then(() => { if (previewAnimation === animation) previewAnimation = null; }).catch(() => {});
  }
  function closeTaskPreview() {
    if (!previewDialog.open || previewClosing) return;
    previewClosing = true;
    previewAnimation?.cancel();
    previewAnimation = null;
    const source = previewSourceCard?.isConnected ? previewSourceCard : [...document.querySelectorAll(".task-card")].find(card => card.dataset.id === previewTaskId);
    const finish = () => {
      previewDialog.classList.remove("is-closing");
      previewClosing = false;
      if (previewDialog.open) previewDialog.close();
    };
    if (reducedMotion.matches || !source) { finish(); return; }
    const cardRect = source.getBoundingClientRect();
    const panelRect = previewDialog.getBoundingClientRect();
    if (!cardRect.width || !panelRect.width || !panelRect.height) { finish(); return; }
    const dx = cardRect.left + cardRect.width / 2 - (panelRect.left + panelRect.width / 2);
    const dy = cardRect.top + cardRect.height / 2 - (panelRect.top + panelRect.height / 2);
    const sx = Math.max(.15, Math.min(1, cardRect.width / panelRect.width));
    const sy = Math.max(.15, Math.min(1, cardRect.height / panelRect.height));
    previewDialog.classList.add("is-closing");
    const animation = previewDialog.animate([
      { transform: "translate(0, 0) scale(1, 1)", opacity: 1, filter: "blur(0px)" },
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, opacity: 0, filter: "blur(10px)" }
    ], { duration: 280, easing: motionToken("--ease-soft", "cubic-bezier(.22,.61,.36,1)"), fill: "forwards" });
    previewAnimation = animation;
    animation.finished.then(finish).catch(finish);
  }
  async function copyTaskText(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* Fall back to the selection copy path. */ }
    try {
      const area = document.createElement("textarea");
      area.className = "clipboard-fallback";
      area.value = text;
      area.setAttribute("readonly", "");
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch { return false; }
  }
  function syncTaskPreview() {
    if (!previewDialog.open || previewClosing) return;
    const task = state.tasks.find(item => item.id === previewTaskId);
    if (!task) {
      previewDialog.close();
      return;
    }
    renderTaskPreview(task);
  }
  previewDialog.addEventListener("cancel", event => { event.preventDefault(); closeTaskPreview(); });
  previewDialog.addEventListener("click", event => { if (event.target === previewDialog) closeTaskPreview(); });
  previewDialog.addEventListener("close", () => {
    previewAnimation?.cancel();
    previewAnimation = null;
    previewClosing = false;
    previewDialog.classList.remove("is-closing");
    previewTaskId = "";
    previewSourceCard = null;
    clearTimeout(copyFeedbackTimer);
    previewCopy.textContent = "复制内容";
    previewCopy.classList.remove("is-copied");
    previewHint.textContent = "选中文字即可复制";
  });
  $("#task-preview-close").addEventListener("click", closeTaskPreview);
  previewCopy.addEventListener("click", async () => {
    const task = state.tasks.find(item => item.id === previewTaskId);
    if (!task) return;
    const text = [task.title, task.content].filter(value => value && value.trim()).join("\n\n");
    const copied = await copyTaskText(text);
    previewCopy.textContent = copied ? "已复制" : "复制失败";
    previewCopy.classList.toggle("is-copied", copied);
    previewHint.textContent = copied ? "已复制到剪贴板" : "请选中文字后按 Ctrl+C 复制";
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      previewCopy.textContent = "复制内容";
      previewCopy.classList.remove("is-copied");
      previewHint.textContent = "选中文字即可复制";
    }, 1600);
  });
  function openEditor(task, area) {
    editing = { id: task.id, area, action: "edit", title: task.title, content: task.content, dueDate: task.dueDate, priority: task.priority, homework: task.homework, longTerm: task.longTerm };
    $("#edit-title").value = task.title;
    $("#edit-content").value = task.content;
    $("#edit-due-date").value = task.dueDate || "";
    $("#edit-priority").value = task.priority;
    specialGroups.forEach(group => { $(`#edit-${group.field}`).checked = Boolean(task[group.field]); });
    $("#edit-error").textContent = "";
    $("#edit-dialog").showModal();
    $("#edit-title").focus();
  }
  function render(focusTarget) {
    if (!["all", "ungrouped", "done"].includes(activeGroup) && !specialGroup(activeGroup) && !state.groups.some(group => group.id === activeGroup)) activeGroup = "all";
    renderFolders();
    const special = specialGroup(activeGroup);
    const doneView = activeGroup === "done";
    const hideCompleted = activeGroup === "all";
    const name = activeGroup === "all" ? "全部待办" : activeGroup === "ungrouped" ? "未分组" : doneView ? "已完成" : special?.name || groupName(activeGroup);
    $("#breadcrumb-current").textContent = name;
    $("#page-title").replaceChildren(document.createTextNode(name), element("span", "heading-dot", "."));
    $("#page-description").textContent = doneView ? "完成的事都收在这里，原分组依然保留。" : special ? (special.field === "longTerm" ? "给需要时间的事，留一个专属位置。" : "把每一份作业安排好，一件件完成。") : activeGroup === "all" ? "把脑海里的事记下来，把专注留给当下。" : activeGroup === "ungrouped" ? "还没找到位置的事，先放在这里。" : "属于这个分组的每件事，都在这里。";
    $("#add-destination").textContent = `新待办的文件位置：「${["all", "ungrouped"].includes(activeGroup) || special ? "未分组" : name}」`;
    for (const selector of ["#add-form", "#title-syntax-hint", "#task-options", "#add-special-options", "#input-caption"]) $(selector).hidden = doneView;
    const scoped = state.tasks.filter(task => doneView ? task.completed : activeGroup === "all" ? !task.longTerm : special ? task[special.field] : activeGroup === "ungrouped" ? !task.groupId : task.groupId === activeGroup);
    const filtered = scoped.filter(task => !task.completed).sort((a, b) => Number(rules.isUrgent(b)) - Number(rules.isUrgent(a)) || b.createdAt - a.createdAt);
    const completed = scoped.filter(task => task.completed).sort((a, b) => b.completedAt - a.completedAt || b.createdAt - a.createdAt);
    const pinned = state.tasks.filter(task => task.pinnedAt && !task.longTerm && !task.completed).sort((a, b) => b.pinnedAt - a.pinnedAt);
    replaceCards(list, filtered.map(task => taskCard(task, "main")));
    replaceCards(completedList, completed.map(task => taskCard(task, "completed")));
    replaceCards(pinnedList, pinned.map(task => taskCard(task, "pinned")));
    if (!hideCompleted && focusTarget?.action === "complete" && focusTarget.area === "completed") landCard(completedList, focusTarget.id);
    if (focusTarget?.action === "pin") landCard(pinnedList, focusTarget.id);
    renderUrgent();
    prioritySignature = getPrioritySignature();
    $("#task-count").textContent = String(filtered.length);
    $("#completed-count").textContent = String(completed.length);
    $("#completed-section").hidden = hideCompleted || completed.length === 0;
    $("#completed-hint").textContent = doneView ? "来自所有分组，原分组保持不变" : "原分组保持不变，可随时取消完成";
    $("#list-toolbar").hidden = doneView;
    $("#pinned-count").textContent = String(pinned.length);
    const emptyVisible = filtered.length === 0 && (hideCompleted || completed.length === 0);
    $("#empty-state").hidden = !emptyVisible;
    $("#pinned-empty").hidden = pinned.length > 0;
    $("#start-button").hidden = doneView;
    $("#empty-title").textContent = doneView ? "还没有完成的事" : activeGroup === "all" ? "给今天一个轻盈的开始" : "这个分组还没有待办";
    $("#empty-description").textContent = doneView ? "点击待办卡片上的 √，完成的事会收在这里，原分组保持不变。" : activeGroup === "all" ? "添加第一件待办，慢慢来，也很好。" : special ? "新建时勾选此分组，或编辑已有待办加入。" : "添加一件新待办，或把卡片拖到左侧分组。";
    $("#list-summary").textContent = doneView ? `${completed.length} 件已完成 · 来自所有分组` : `${filtered.length} 件待办${!hideCompleted && completed.length ? ` · ${completed.length} 件已完成` : ""}${activeGroup !== "all" ? ` · ${name}` : ""}`;
    updateSaveStatus();
    if (previewDialog.open) syncTaskPreview();
    if (workspaceView === "calendar") renderCalendar();
    syncWorkspaceChrome();
    syncCardsToggles();
    if (workspaceView === "review") renderReview();
    if (workspaceView === "focus") syncFocusSetup();
    if (focusTarget) {
      if (focusTarget.area === "calendar") {
        const agenda = [...$("#calendar-agenda-list").querySelectorAll("[data-task-id]")].find(node => node.dataset.taskId === focusTarget.id);
        (agenda || $("#calendar-grid .calendar-day-number[tabindex='0']"))?.focus({ preventScroll: true });
      } else {
        const root = rootFor(focusTarget.area);
        const card = [...root.children].find(item => item.dataset.id === focusTarget.id);
        let target = card?.querySelector(focusTarget.action === "move" ? "select" : `[data-action="${focusTarget.action}"]`);
        if (hideCompleted && focusTarget.area === "completed") target = document.querySelector('#system-groups [data-group-id="done"]');
        target = target || (input.offsetParent !== null ? input : document.querySelector(`#system-groups [data-group-id="${activeGroup}"]`));
        target?.focus({ preventScroll: true });
      }
    }
  }
  function moveTask(id, groupId, focusTarget) {
    const task = state.tasks.find(item => item.id === id);
    if (!task || (groupId && !state.groups.some(group => group.id === groupId))) return;
    if (task.groupId === groupId) return;
    task.groupId = groupId;
    commit(`已移至「${groupName(groupId)}」`, focusTarget);
  }
  for (const nav of [$("#system-groups"), $("#custom-groups")]) {
    nav.addEventListener("click", event => {
      const target = event.target.closest("button[data-group-id]");
      if (!target) return;
      activeGroup = target.dataset.groupId;
      workspaceView = "todo";
      resetSpecialFields();
      render();
      [...nav.children].find(item => item.dataset.groupId === activeGroup)?.focus({ preventScroll: true });
    });
    nav.addEventListener("dragover", event => {
      const target = event.target.closest("button[data-group-id]");
      if (!target || ["all", "done"].includes(target.dataset.groupId) || !draggingId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("drag-over");
    });
    nav.addEventListener("dragleave", event => {
      const target = event.target.closest("button[data-group-id]");
      if (target && !target.contains(event.relatedTarget)) target.classList.remove("drag-over");
    });
    nav.addEventListener("drop", event => {
      const target = event.target.closest("button[data-group-id]");
      if (!target || ["all", "done"].includes(target.dataset.groupId) || !draggingId) return;
      event.preventDefault();
      const id = event.dataTransfer.getData("application/x-yijian-task");
      if (id !== draggingId) return;
      draggingId = null;
      target.classList.remove("drag-over");
      const special = specialGroup(target.dataset.groupId);
      if (special) {
        const task = state.tasks.find(item => item.id === id);
        if (task && !task[special.field]) { task[special.field] = true; commit(`已加入「${special.name}」，原分组保持不变`); }
      } else moveTask(id, target.dataset.groupId === "ungrouped" ? null : target.dataset.groupId);
    });
  }
  for (const root of [list, completedList, pinnedList, urgentList]) {
    root.addEventListener("dragstart", event => {
      const card = event.target.closest(".task-card");
      if (!card || event.target.closest("button,select,option")) { event.preventDefault(); return; }
      draggingId = card.dataset.id;
      event.dataTransfer.setData("application/x-yijian-task", draggingId);
      event.dataTransfer.setData("text/plain", draggingId);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    root.addEventListener("dragend", () => {
      draggingId = null;
      lastDragEndAt = Date.now();
      document.querySelectorAll(".dragging,.drag-over").forEach(node => node.classList.remove("dragging", "drag-over"));
    });
    root.addEventListener("click", event => {
      const target = event.target.closest("button[data-action]");
      if (!target) return;
      const card = target.closest(".task-card");
      const task = state.tasks.find(item => item.id === card.dataset.id);
      if (!task) return;
      if (target.dataset.action === "edit") {
        openEditor(task, card.dataset.area);
      } else if (target.dataset.action === "fold") {
        task.collapsed = !task.collapsed;
        commit(null, { id: task.id, area: card.dataset.area, action: "fold" });
      } else if (target.dataset.action === "pin") {
        task.pinnedAt = task.pinnedAt ? 0 : state.tasks.reduce((latest, item) => Math.max(latest, item.pinnedAt + 1), Date.now());
        commit(task.pinnedAt ? task.longTerm ? "已记录置顶状态，长期事项不在右侧置顶区展示" : task.completed ? "已记录置顶状态，取消完成后会回到右侧" : "已置顶，切换分组也能看见" : "已取消置顶", { id: task.id, area: card.dataset.area, action: "pin" });
      } else if (target.dataset.action === "complete") {
        const nextCompleted = !task.completed;
        task.completedAt = nextCompleted ? state.tasks.reduce((latest, item) => Math.max(latest, item.completedAt + 1), Date.now()) : 0;
        task.completed = nextCompleted;
        task.reviews = [0, 0, 0, 0];
        commit(nextCompleted ? "已完成，仍保留在原分组" : "已恢复待办，回到原分组", { id: task.id, area: nextCompleted ? "completed" : "main", action: "complete" });
      } else {
        const neighbor = card.nextElementSibling || card.previousElementSibling;
        state.tasks = state.tasks.filter(item => item.id !== task.id);
        commit("已删除待办", neighbor ? { id: neighbor.dataset.id, area: card.dataset.area, action: "delete" } : { id: "", action: "delete" });
      }
    });
    root.addEventListener("change", event => {
      if (!event.target.matches(".move-select")) return;
      const card = event.target.closest(".task-card");
      moveTask(card.dataset.id, event.target.value || null, { id: card.dataset.id, area: card.dataset.area, action: "move" });
    });
    root.addEventListener("click", event => {
      if (event.target.closest("button,select,option,a,input,textarea,label")) return;
      if (draggingId || Date.now() - lastDragEndAt < 400) return;
      const card = event.target.closest(".task-card");
      if (!card || !root.contains(card)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
      const task = state.tasks.find(item => item.id === card.dataset.id);
      if (!task) return;
      openTaskPreview(task, card);
    });
  }
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (event.isComposing || composing || event.keyCode === 229) { event.preventDefault(); return; }
    if (!event.shiftKey) { event.preventDefault(); $("#add-form").requestSubmit(); }
  });
  input.addEventListener("input", () => input.setCustomValidity(""));
  headingInput.addEventListener("input", () => input.setCustomValidity(""));
  headingInput.addEventListener("keydown", event => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
  $("#add-form").addEventListener("submit", event => {
    event.preventDefault();
    if (composing) return;
    const text = parseText(headingInput.value, input.value);
    if (!text.title && !text.content) { input.setCustomValidity("标题和正文至少填写一项"); input.reportValidity(); return; }
    if (text.title.length > 120) { input.setCustomValidity("标题最多 120 个字，请将其余内容换行写入正文"); input.reportValidity(); return; }
    const dueDate = $("#task-due-date").value || null;
    if (dueDate && !rules.validDueDate(dueDate)) { notify("请选择有效的截止日期"); return; }
    const categories = readSpecialFields("task");
    state.tasks.push({ id: makeId(), ...text, ...categories, collapsed: false, dueDate, priority: $("#task-priority").value, completed: false, completedAt: 0, reviews: [0, 0, 0, 0], createdAt: Date.now(), pinnedAt: 0, groupId: ["all", "ungrouped"].includes(activeGroup) || specialGroup(activeGroup) ? null : activeGroup });
    input.value = "";
    headingInput.value = "";
    $("#task-due-date").value = "";
    $("#task-priority").value = "normal";
    resetSpecialFields();
    commit(categories.longTerm && activeGroup === "all" ? "已添加到「长期事项」，可从首页卡片查看" : "已添加待办");
    input.focus();
  });
  $("#start-button").addEventListener("click", () => input.focus());
  function todayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function renderDaily() {
    dailyDate = todayKey();
    $("#daily-date").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
    $("#daily-list").replaceChildren(...state.dailyTasks.map(task => {
      const row = element("li", `daily-item${task.completedOn === dailyDate ? " is-done" : ""}`);
      row.dataset.id = task.id;
      const checkbox = element("input", "daily-checkbox");
      checkbox.type = "checkbox";
      checkbox.checked = task.completedOn === dailyDate;
      checkbox.setAttribute("aria-label", `完成每日任务：${task.title}`);
      const title = element("input", "daily-item-title");
      title.type = "text";
      title.value = task.title;
      title.maxLength = 200;
      title.setAttribute("aria-label", "编辑每日任务内容");
      row.append(checkbox, title, button("daily-delete", `删除每日任务：${task.title}`, "trash"));
      return row;
    }));
    const completed = state.dailyTasks.filter(task => task.completedOn === dailyDate).length;
    $("#daily-summary").textContent = `今天已完成 ${completed} / ${state.dailyTasks.length}`;
    $("#daily-progress").max = Math.max(1, state.dailyTasks.length);
    $("#daily-progress").value = completed;
    $("#daily-empty").hidden = state.dailyTasks.length > 0;
  }
  function openDaily() {
    renderDaily();
    if (!$("#daily-dialog").open) $("#daily-dialog").showModal();
    $("#daily-done").focus();
  }
  $("#daily-button").addEventListener("click", openDaily);
  $("#daily-save").addEventListener("click", async () => {
    writeBrowser();
    if (["http:", "https:"].includes(location.protocol)) {
      await saveLocal();
      $("#daily-save-hint").textContent = localAvailable && diskRevision && diskModifiedAt === state.modifiedAt ? "每日任务已保存到本地，以后每天沿用这份清单，需要时再修改。" : "本地保存未成功，请查看页面提示；更改仍保留在浏览器中。";
    } else {
      $("#daily-save-hint").textContent = browserAvailable ? "每日任务已保存在当前浏览器，以后每天沿用。写入电脑文件夹请通过启动待办.cmd 打开。" : "浏览器保存不可用，请通过启动待办.cmd 打开后保存到本地。";
      notify(browserAvailable ? "每日任务已保存，以后每天沿用" : "浏览器保存不可用");
    }
  });
  for (const id of ["#daily-close", "#daily-done"]) $(id).addEventListener("click", () => $("#daily-dialog").close());
  $("#daily-dialog").addEventListener("close", () => $("#daily-button").focus({ preventScroll: true }));
  $("#daily-add-form").addEventListener("submit", event => {
    event.preventDefault();
    const title = $("#daily-input").value.trim();
    if (!title) { $("#daily-input").setCustomValidity("请输入每日任务内容"); $("#daily-input").reportValidity(); return; }
    if (state.dailyTasks.length >= 500) { notify("每日任务最多添加 500 项"); return; }
    state.dailyTasks.push({ id: makeId(), title, completedOn: null });
    $("#daily-input").value = "";
    commit();
    renderDaily();
    $("#daily-input").focus();
  });
  $("#daily-input").addEventListener("input", () => $("#daily-input").setCustomValidity(""));
  $("#daily-input").addEventListener("keydown", event => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
  $("#daily-list").addEventListener("input", event => {
    if (!event.target.matches(".daily-item-title")) return;
    const task = state.dailyTasks.find(item => item.id === event.target.closest("li").dataset.id);
    if (!task) return;
    const title = event.target.value.trim();
    if (!title) { $("#daily-save-hint").textContent = "任务内容不能为空，清空后会保留上次保存的内容。"; return; }
    task.title = title;
    event.target.closest("li").querySelector(".daily-checkbox").setAttribute("aria-label", `完成每日任务：${title}`);
    commit();
    $("#daily-save-hint").textContent = "清单自动保留在浏览器，点击「保存每日任务」可写入本地。";
  });
  $("#daily-list").addEventListener("focusout", event => {
    if (!event.target.matches(".daily-item-title")) return;
    const task = state.dailyTasks.find(item => item.id === event.target.closest("li").dataset.id);
    if (task) event.target.value = task.title;
  });
  $("#daily-list").addEventListener("keydown", event => {
    if (event.target.matches(".daily-item-title") && event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.target.blur(); }
  });
  $("#daily-list").addEventListener("change", event => {
    if (!event.target.matches(".daily-checkbox")) return;
    const task = state.dailyTasks.find(item => item.id === event.target.closest("li").dataset.id);
    if (!task) return;
    task.completedOn = event.target.checked ? todayKey() : null;
    const id = task.id;
    commit();
    renderDaily();
    [...$("#daily-list").children].find(row => row.dataset.id === id)?.querySelector(".daily-checkbox").focus();
  });
  $("#daily-list").addEventListener("click", event => {
    const target = event.target.closest(".daily-delete-button");
    if (!target) return;
    state.dailyTasks = state.dailyTasks.filter(task => task.id !== target.closest("li").dataset.id);
    commit("已删除每日任务");
    renderDaily();
    $("#daily-input").focus();
  });
  $("#cancel-edit").addEventListener("click", () => $("#edit-dialog").close());
  $("#edit-dialog").addEventListener("close", () => {
    const previous = editing;
    editing = null;
    if (!previous) return;
    if (previous.area === "calendar") {
      const agenda = [...$("#calendar-agenda-list").querySelectorAll("[data-task-id]")].find(node => node.dataset.taskId === previous.id);
      (agenda || $("#calendar-grid .calendar-day-number[tabindex='0']"))?.focus({ preventScroll: true });
      return;
    }
    const root = rootFor(previous.area);
    [...root.children].find(card => card.dataset.id === previous.id)?.querySelector(".edit-button")?.focus({ preventScroll: true });
  });
  for (const field of [$("#edit-title"), $("#edit-content")]) {
    field.addEventListener("input", () => { $("#edit-error").textContent = ""; });
    field.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      if (event.isComposing || event.keyCode === 229) { if (field.id === "edit-title" || event.ctrlKey || event.metaKey) event.preventDefault(); return; }
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); $("#edit-form").requestSubmit(); }
    });
  }
  $("#edit-form").addEventListener("submit", event => {
    event.preventDefault();
    const text = parseText($("#edit-title").value, $("#edit-content").value);
    if (!text.title && !text.content) { $("#edit-error").textContent = "标题和正文至少填写一项。"; return; }
    if (text.title.length > 120) { $("#edit-error").textContent = "标题最多 120 个字，请将其余内容换行写入正文。"; return; }
    const task = state.tasks.find(item => item.id === editing?.id);
    if (!task) { $("#edit-error").textContent = "这条待办已被删除，请关闭编辑窗口。"; return; }
    if (task.title !== editing.title || task.content !== editing.content || task.dueDate !== editing.dueDate || task.priority !== editing.priority || task.homework !== editing.homework || task.longTerm !== editing.longTerm) { $("#edit-error").textContent = "这条待办已在其他页面修改，请关闭后重新编辑。"; return; }
    const dueDate = $("#edit-due-date").value || null;
    if (dueDate && !rules.validDueDate(dueDate)) { $("#edit-error").textContent = "请选择有效的截止日期。"; return; }
    const target = editing;
    Object.assign(task, text, readSpecialFields("edit"), { dueDate, priority: $("#edit-priority").value });
    $("#edit-dialog").close();
    commit("已保存修改", target);
  });
  $("#add-group-button").addEventListener("click", () => { $("#group-form").reset(); $("#group-error").textContent = ""; dialog.showModal(); groupInput.focus(); });
  $("#cancel-group").addEventListener("click", () => dialog.close());
  groupInput.addEventListener("input", () => { $("#group-error").textContent = ""; });
  groupInput.addEventListener("keydown", event => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
  $("#group-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = groupInput.value.trim();
    if (!validGroupName(name)) { $("#group-error").textContent = "请输入有效文件夹名，勿使用斜杠、特殊符号或系统保留名称。"; return; }
    if (state.groups.some(group => group.name.toLowerCase() === name.toLowerCase())) { $("#group-error").textContent = "这个分组已经存在，换个名字吧。"; return; }
    const group = { id: makeId(), name };
    state.groups.push(group);
    activeGroup = group.id;
    workspaceView = "todo";
    resetSpecialFields();
    dialog.close();
    commit(`已创建「${name}」`);
    input.focus();
  });

  const calendarView = $("#calendar-view");
  const todoView = $("#todo-view");
  const calendarGrid = $("#calendar-grid");
  const calendarTooltip = $("#calendar-tooltip");
  const workspaceButtons = [...document.querySelectorAll("#workspace-switcher [data-workspace]")];
  const CALENDAR_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let calendarSelected = todayKey();
  let calendarDueIndex = new Map();
  let calendarTodayKey = todayKey();
  const CAL_SHAPE_KEY = "yijian.calShape";
  const shapeButtons = [...document.querySelectorAll(".calendar-shape-toggle [data-shape]")];
  function readCalendarShape() {
    try { const value = localStorage.getItem(CAL_SHAPE_KEY); return value === "rounded" ? "rounded" : "circle"; } catch { return "circle"; }
  }
  function setCalendarShape(shape, persist = true) {
    const next = shape === "rounded" ? "rounded" : "circle";
    calendarView.dataset.shape = next;
    for (const button of shapeButtons) button.setAttribute("aria-pressed", String(button.dataset.shape === next));
    if (persist) { try { localStorage.setItem(CAL_SHAPE_KEY, next); } catch { /* 存储不可用时仅本次页面生效 */ } }
  }
  for (const button of shapeButtons) button.addEventListener("click", () => setCalendarShape(button.dataset.shape));
  setCalendarShape(readCalendarShape(), false);
  const CAL_SIZE_KEY = "yijian.calSize";
  const sizeInput = $("#calendar-size");
  const sizeValue = $("#calendar-size-value");
  function readCalendarSize() {
    try { const value = parseFloat(localStorage.getItem(CAL_SIZE_KEY)); return Number.isFinite(value) ? Math.min(1.5, Math.max(0.7, value)) : 1; } catch { return 1; }
  }
  function setCalendarSize(scale, persist = true) {
    const next = Math.min(1.5, Math.max(0.7, Number(scale) || 1));
    calendarView.style.setProperty("--cal-num-scale", String(next));
    sizeInput.value = String(next);
    sizeValue.textContent = `${Math.round(next * 100)}%`;
    if (persist) { try { localStorage.setItem(CAL_SIZE_KEY, String(next)); } catch { /* 存储不可用时仅本次页面生效 */ } }
  }
  sizeInput.addEventListener("input", () => setCalendarSize(sizeInput.value));
  setCalendarSize(readCalendarSize(), false);
  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function addCalendarDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  }
  function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }
  function syncWorkspaceChrome() {
    document.querySelector(".app-shell").dataset.workspace = workspaceView;
    todoView.hidden = workspaceView !== "todo";
    calendarView.hidden = workspaceView !== "calendar";
    reviewView.hidden = workspaceView !== "review";
    focusView.hidden = workspaceView !== "focus";
    for (const item of workspaceButtons) {
      const active = item.dataset.workspace === workspaceView;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    }
    if (workspaceView === "calendar") {
      $("#breadcrumb-current").textContent = "计划日历";
      document.title = "计划日历 · 一件";
    } else if (workspaceView === "review") {
      $("#breadcrumb-current").textContent = "艾宾浩斯";
      document.title = "艾宾浩斯 · 一件";
    } else if (workspaceView === "focus") {
      $("#breadcrumb-current").textContent = "专注钟";
      if (!focusActive) document.title = "专注钟 · 一件";
    } else {
      document.title = "一件 · 我的待办";
    }
    const pageKey = workspaceView === "calendar" ? "calendar" : workspaceView === "review" ? "review" : workspaceView === "focus" ? "focus" : `todo:${activeGroup}`;
    if (lastPageKey !== pageKey) {
      lastPageKey = pageKey;
      playPageTransition();
    }
  }
  function setWorkspace(view) {
    const next = ["todo", "calendar", "review", "focus"].includes(view) ? view : "todo";
    if (next === workspaceView) { syncWorkspaceChrome(); return; }
    if (next === "review") reviewChartNeedsAnimation = true;
    workspaceView = next;
    hideCalendarTooltip();
    if (workspaceView === "calendar") {
      syncWorkspaceChrome();
      renderFolders();
      renderCalendar();
    } else {
      render();
    }
  }
  for (const item of workspaceButtons) item.addEventListener("click", () => setWorkspace(item.dataset.workspace));
  function buildCalendarDueIndex() {
    const index = new Map();
    for (const task of state.tasks) {
      if (!rules.validDueDate(task.dueDate)) continue;
      const tasks = index.get(task.dueDate);
      if (tasks) tasks.push(task);
      else index.set(task.dueDate, [task]);
    }
    for (const tasks of index.values()) tasks.sort((a, b) => Number(a.completed) - Number(b.completed) || Number(rules.isUrgent(b)) - Number(rules.isUrgent(a)) || a.createdAt - b.createdAt);
    return index;
  }
  function calendarTaskMeta(task) {
    const parts = [groupName(task.groupId)];
    if (task.homework) parts.push("作业");
    if (task.longTerm) parts.push("长期事项");
    if (task.completed) parts.push("已完成");
    else if (rules.isUrgent(task)) parts.push(rules.urgentReason(task));
    else parts.push("一般");
    return parts.join(" · ");
  }
  function renderCalendar(animateDirection = null) {
    calendarDueIndex = buildCalendarDueIndex();
    calendarTodayKey = todayKey();
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    $("#calendar-month-title").replaceChildren(document.createTextNode(`${year} 年 ${month + 1} 月`), element("span", "heading-dot", "."));
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
    const selectedDate = parseDateKey(calendarSelected);
    const fragment = document.createDocumentFragment();
    let dueDays = 0, dueTasks = 0;
    for (let week = 0; week < 6; week++) {
      const row = element("div", "calendar-week");
      row.setAttribute("role", "row");
      for (let column = 0; column < 7; column++) {
        const date = addCalendarDays(start, week * 7 + column);
        const key = localDateKey(date);
        const tasks = calendarDueIndex.get(key) || [];
        const pending = tasks.filter(task => !task.completed);
        const outside = date.getMonth() !== month;
        const selected = key === calendarSelected;
        const cell = element("div", "calendar-day");
        cell.dataset.date = key;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-selected", String(selected));
        cell.classList.toggle("is-outside", outside);
        cell.classList.toggle("is-selected", selected);
        cell.classList.toggle("is-today", key === calendarTodayKey);
        cell.classList.toggle("is-weekend", date.getDay() === 0 || date.getDay() === 6);
        cell.classList.toggle("has-due", pending.length > 0);
        if (!outside && pending.length) { dueDays += 1; dueTasks += pending.length; }
        const number = element("button", "calendar-day-number", String(date.getDate()));
        number.type = "button";
        number.dataset.date = key;
        number.tabIndex = selected ? 0 : -1;
        number.setAttribute("aria-label", `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日，${CALENDAR_WEEKDAYS[date.getDay()]}${tasks.length ? `，${pending.length} 件未完成、共 ${tasks.length} 件截止待办` : "，没有待办截止"}`);
        cell.append(number);
        row.append(cell);
      }
      fragment.append(row);
    }
    calendarGrid.replaceChildren(fragment);
    $("#calendar-month-summary").textContent = dueDays ? `本月 ${dueDays} 天有截止 · ${dueTasks} 件未完成` : "本月暂无待办截止";
    $("#calendar-agenda-title").textContent = `${selectedDate.getFullYear()} 年 ${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日 · ${CALENDAR_WEEKDAYS[selectedDate.getDay()]}`;
    renderCalendarAgenda();
    hideCalendarTooltip();
    if (typeof animateDirection === "number") playPageTransition();
  }
  function renderCalendarAgenda() {
    const tasks = calendarDueIndex.get(calendarSelected) || [];
    $("#calendar-agenda-count").textContent = String(tasks.length);
    $("#calendar-agenda-list").replaceChildren(...tasks.map((task, index) => {
      const item = element("li", `calendar-agenda-item${task.completed ? " is-done" : ""}`);
      item.dataset.taskId = task.id;
      item.style.setProperty("--agenda-index", String(Math.min(index, 10)));
      const open = element("button", "calendar-agenda-open");
      open.type = "button";
      open.dataset.taskId = task.id;
      const top = element("div", "calendar-agenda-top");
      top.append(element("strong", "", taskLabel(task)), element("span", `calendar-agenda-status${!task.completed && rules.isUrgent(task) ? " is-urgent" : ""}`, task.completed ? "已完成" : rules.isUrgent(task) ? rules.urgentReason(task) : "待办"));
      open.append(top);
      if (task.content && task.content !== taskLabel(task)) open.append(element("p", "calendar-agenda-content", task.content));
      open.append(element("span", "calendar-agenda-meta", `${calendarTaskMeta(task)} · 截止 ${task.dueDate}`));
      item.append(open);
      return item;
    }));
    $("#calendar-agenda-empty").hidden = tasks.length > 0;
  }
  function reviewDayNumber(value) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
  function completedDays(task, now = Date.now()) {
    if (!task.completedAt) return 0;
    return Math.max(0, Math.round((reviewDayNumber(now) - reviewDayNumber(task.completedAt)) / 86400000));
  }
  function memoryRetention(days) {
    return 8 + 92 * Math.exp(-Math.max(0, days) / 3.4);
  }
  function reviewRecords(now = Date.now()) {
    return state.tasks.filter(task => task.completed && task.completedAt > 0 && Array.isArray(task.reviews) && task.reviews.some(value => !value))
      .map(task => {
        const days = completedDays(task, now);
        const due = REVIEW_INTERVALS.map((interval, index) => !task.reviews[index] && days >= interval);
        return { task, days, done: task.reviews.filter(Boolean).length, due, dueIndexes: due.map((value, index) => value ? index : -1).filter(index => index >= 0) };
      })
      .sort((a, b) => a.task.completedAt - b.task.completedAt || a.task.createdAt - b.task.createdAt);
  }
  function nextReviewText(records) {
    let soonest = Infinity;
    for (const record of records) {
      REVIEW_INTERVALS.forEach((interval, index) => {
        if (!record.task.reviews[index]) {
          const remaining = interval - record.days;
          if (remaining > 0) soonest = Math.min(soonest, remaining);
        }
      });
    }
    return Number.isFinite(soonest) ? `下一次复习在 ${soonest} 天后` : "";
  }
  function reviewCard(record) {
    const { task, days, done, due, dueIndexes } = record;
    const card = element("li", "review-card");
    card.dataset.id = task.id;
    const top = element("div", "review-card-top");
    const tag = element("div", "review-card-tag");
    tag.append(icon(task.groupId ? "folder" : "inbox"), element("span", "", groupName(task.groupId)));
    top.append(tag, element("span", "review-card-days", days === 0 ? "今天完成" : `已完成 ${days} 天`));
    const title = element("h3", "review-card-title", taskLabel(task));
    card.append(top, title);
    if (task.content && task.content !== taskLabel(task)) card.append(element("p", "review-card-preview", task.content));
    const progress = element("div", "review-progress");
    const progressText = element("span");
    progressText.append(document.createTextNode("复习进度 "), element("strong", "", `${done}/4`));
    progress.append(progressText, element("span", "", `今日应打卡：${dueIndexes.map(index => `${REVIEW_INTERVALS[index]}天`).join("、")}`));
    card.append(progress);
    const row = element("div", "review-check-row");
    REVIEW_INTERVALS.forEach((interval, index) => {
      const state = task.reviews[index] ? "done" : due[index] ? "due" : "locked";
      const check = element("button", `review-check is-${state}`, state === "done" ? `✓ ${interval}天` : `${interval}天`);
      check.type = "button";
      check.dataset.index = String(index);
      check.disabled = state !== "due";
      if (state === "done") check.setAttribute("aria-pressed", "true");
      check.title = state === "due" ? `完成第 ${interval} 天复习打卡` : state === "done" ? `第 ${interval} 天复习已完成` : `第 ${interval} 天复习还没到`;
      check.setAttribute("aria-label", `${check.title}：${taskLabel(task)}`);
      row.append(check);
    });
    card.append(row);
    return card;
  }
  function renderReviewDueList(records, dueRecords) {
    reviewDueBadge.textContent = String(dueRecords.length);
    reviewDueList.hidden = dueRecords.length === 0;
    reviewEmpty.hidden = dueRecords.length > 0;
    reviewDueList.replaceChildren(...dueRecords.map(reviewCard));
    if (dueRecords.length) return;
    const next = nextReviewText(records);
    reviewEmptyTitle.textContent = records.length ? "今天没有需要复习的待办" : "完成待办后，开始记忆曲线";
    reviewEmptyDescription.textContent = records.length ? `${next ? `${next}。` : ""}还有 ${records.length} 件待办在记忆周期中。` : "完成任意待办后，记忆点会出现在左侧曲线，并按 1 / 3 / 7 / 15 天进入复习。";
  }
  function svgNode(tag, attributes = {}, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderReviewChart(records) {
    const hostWidth = reviewChartHost.clientWidth;
    if (!hostWidth) return;
    const width = Math.max(200, Math.floor(hostWidth));
    const height = width < 360 ? 270 : width < 620 ? 330 : 390;
    const compact = width < 360;
    const left = compact ? 30 : 42;
    const right = compact ? 12 : 22;
    const top = compact ? 30 : 34;
    const bottom = compact ? 38 : 42;
    const plotWidth = Math.max(80, width - left - right);
    const plotHeight = Math.max(120, height - top - bottom);
    const bottomY = top + plotHeight;
    const maxDays = records.length ? Math.max(...records.map(record => record.days)) : 15;
    const domainMax = Math.max(15, Math.ceil(maxDays / 5) * 5);
    const xScale = day => left + Math.min(1, Math.max(0, day / domainMax)) * plotWidth;
    const yScale = retention => top + (1 - retention / 100) * plotHeight;
    const dueCount = records.filter(record => record.dueIndexes.length).length;
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `艾宾浩斯遗忘曲线，${records.length} 件待办参与记忆，${dueCount} 件今日待复习`,
      preserveAspectRatio: "xMidYMid meet"
    });
    const defs = svgNode("defs");
    const gradient = svgNode("linearGradient", { id: "review-area-gradient", x1: "0", x2: "0", y1: "0", y2: "1" });
    gradient.append(svgNode("stop", { offset: "0%", class: "review-area-top" }), svgNode("stop", { offset: "100%", class: "review-area-bottom" }));
    defs.append(gradient);
    svg.append(defs);
    const frame = svgNode("g", { class: "review-chart-frame" });
    svg.append(frame);
    for (const value of [0, 25, 50, 75, 100]) {
      const y = yScale(value);
      frame.append(svgNode("line", { x1: left, x2: left + plotWidth, y1: y, y2: y, class: "review-grid-line" }));
      if (value === 0 || value === 50 || value === 100) frame.append(svgNode("text", { x: left - 8, y: y + 3, "text-anchor": "end", class: "review-axis-label" }, `${value}%`));
    }
    frame.append(svgNode("line", { x1: left, x2: left, y1: top, y2: bottomY, class: "review-axis-line" }));
    frame.append(svgNode("line", { x1: left, x2: left + plotWidth, y1: bottomY, y2: bottomY, class: "review-axis-line" }));
    const ticks = [0, 1, 3, 7, 15].filter(value => value <= domainMax);
    if (domainMax > 15) ticks.push(domainMax);
    const labelTicks = compact ? ticks.filter(value => value === 0 || value === 7 || value === 15 || value === domainMax) : ticks;
    for (const value of ticks) {
      const x = xScale(value);
      frame.append(svgNode("line", { x1: x, x2: x, y1: bottomY, y2: bottomY + 4, class: "review-axis-line" }));
      if (labelTicks.includes(value)) frame.append(svgNode("text", { x, y: height - (compact ? 18 : 22), "text-anchor": "middle", class: "review-axis-label" }, value === domainMax && domainMax > 15 ? `${value}天` : String(value)));
    }
    frame.append(svgNode("text", { x: width - right, y: height - 5, "text-anchor": "end", class: "review-axis-title" }, "完成后的天数"));
    const labelBoxes = [];
    REVIEW_INTERVALS.forEach((interval, index) => {
      if (interval > domainMax) return;
      const x = xScale(interval);
      frame.append(svgNode("line", { x1: x, x2: x, y1: top, y2: bottomY, class: "review-review-line" }));
      const labelY = top - 10 + (compact && index % 2 ? 11 : 0);
      frame.append(svgNode("text", { x, y: labelY, "text-anchor": "middle", class: "review-review-label" }, `${interval}天`));
      const labelWidth = interval >= 10 ? 30 : 22;
      labelBoxes.push({ x: x - labelWidth / 2, y: labelY - 10, width: labelWidth, height: 13 });
    });
    const curvePoints = [];
    const steps = 96;
    for (let index = 0; index <= steps; index++) {
      const day = domainMax * index / steps;
      curvePoints.push([xScale(day), yScale(memoryRetention(day))]);
    }
    const curvePath = curvePoints.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
    const area = `${curvePath} L ${curvePoints.at(-1)[0].toFixed(2)} ${bottomY} L ${curvePoints[0][0].toFixed(2)} ${bottomY} Z`;
    svg.append(svgNode("path", { d: area, class: "review-curve-area" }));
    svg.append(svgNode("path", { d: curvePath, class: "review-curve-path" }));
    const groups = new Map();
    for (const record of records) {
      if (!groups.has(record.days)) groups.set(record.days, []);
      groups.get(record.days).push(record);
    }
    const pointBoxes = [];
    const labelData = [];
    for (const [day, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const baseY = yScale(memoryRetention(day));
      const baseX = xScale(day);
      group.forEach((record, index) => {
        const spread = group.length > 1 ? (index - (group.length - 1) / 2) * 9 : 0;
        const x = Math.max(left + 5, Math.min(left + plotWidth - 5, baseX + spread));
        if (record.dueIndexes.length) svg.append(svgNode("circle", { cx: x, cy: baseY, r: 9, class: "review-point-halo" }));
        const point = svgNode("circle", { cx: x, cy: baseY, r: 4.5, class: `review-point${record.dueIndexes.length ? " is-due" : ""}`, tabindex: "0" });
        point.dataset.id = record.task.id;
        point.setAttribute("role", "img");
        point.setAttribute("aria-label", `${taskLabel(record.task)}，完成 ${day} 天，已复习 ${record.done}/4${record.dueIndexes.length ? `，今日应打卡 ${record.dueIndexes.map(index => `${REVIEW_INTERVALS[index]}天`).join("、")}` : ""}`);
        point.append(svgNode("title", {}, `${taskLabel(record.task)} · ${groupName(record.task.groupId)} · 完成 ${day} 天 · 已复习 ${record.done}/4${record.dueIndexes.length ? " · 今日待复习" : ""}`));
        svg.append(point);
        pointBoxes.push({ x: x - 10, y: baseY - 10, width: 20, height: 20 });
      });
      const fullLabel = taskLabel(group[0].task);
      const limit = compact ? 5 : 9;
      const labelText = `${[...fullLabel].slice(0, limit).join("")}${[...fullLabel].length > limit ? "…" : ""}${group.length > 1 ? ` +${group.length - 1}` : ""}`;
      const estimatedWidth = [...labelText].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 11 : 6), 0);
      labelData.push({ baseX, baseY, labelText, estimatedWidth });
    }
    const labels = [];
    for (const { baseX, baseY, labelText, estimatedWidth } of labelData) {
      const candidates = [
        [baseX + 10, baseY - 18], [baseX - estimatedWidth - 10, baseY - 18],
        [baseX + 10, baseY + 24], [baseX - estimatedWidth - 10, baseY + 24],
        [baseX + 10, baseY - 30], [baseX - estimatedWidth - 10, baseY - 30],
        [baseX + 10, baseY + 36], [baseX - estimatedWidth - 10, baseY + 36],
        [baseX + 10, baseY - 42], [baseX - estimatedWidth - 10, baseY - 42]
      ];
      for (const [labelX, labelY] of candidates) {
        if (labelX < left + 3 || labelX + estimatedWidth > left + plotWidth - 3) continue;
        if (labelY < top + 11 || labelY > bottomY - 4) continue;
        const overlaps = box => labelX < box.x + box.width + 4 && labelX + estimatedWidth + 4 > box.x && labelY - 11 < box.y + box.height + 3 && labelY + 3 > box.y - 3;
        if (labelBoxes.some(overlaps) || pointBoxes.some(overlaps)) continue;
        labelBoxes.push({ x: labelX, y: labelY - 10, width: estimatedWidth, height: 13 });
        labels.push(svgNode("text", { x: labelX, y: labelY, class: "review-point-label" }, labelText));
        break;
      }
    }
    for (const label of labels) svg.append(label);
    if (!records.length) svg.append(svgNode("text", { x: left + plotWidth / 2, y: top + plotHeight / 2.2, "text-anchor": "middle", class: "review-chart-empty-text" }, "完成待办后，记忆点会出现在这里"));
    reviewChartHost.replaceChildren(svg);
    if (reviewChartNeedsAnimation) animateReviewChart(svg);
  }
  function animateReviewChart(svg) {
    reviewChartNeedsAnimation = false;
    if (reducedMotion.matches) return;
    const frame = svg.querySelector(".review-chart-frame");
    const area = svg.querySelector(".review-curve-area");
    const path = svg.querySelector(".review-curve-path");
    const points = [...svg.querySelectorAll(".review-point")];
    const halos = [...svg.querySelectorAll(".review-point-halo")];
    const labels = [...svg.querySelectorAll(".review-point-label")];
    const empty = svg.querySelector(".review-chart-empty-text");
    const width = Number((svg.getAttribute("viewBox") || "").split(" ")[2]) || 620;
    const easing = motionToken("--ease-soft", "cubic-bezier(.22,.61,.36,1)");
    const spring = motionToken("--spring-bounce", "cubic-bezier(.34,1.56,.64,1)");
    if (frame) frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 340, easing, fill: "both" });
    if (area) area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 560, delay: 520, easing, fill: "both" });
    if (path) {
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      const draw = path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 900, delay: 540, easing, fill: "both" });
      draw.finished.then(() => {
        if (!path.isConnected) return;
        path.style.removeProperty("stroke-dasharray");
        path.style.removeProperty("stroke-dashoffset");
      }).catch(() => {});
    }
    const delayFor = x => 540 + Math.min(1, Math.max(0, x / width)) * 760;
    const animateDot = (node, x, scaleFrom) => {
      node.style.transformBox = "fill-box";
      node.style.transformOrigin = "center";
      node.animate([{ opacity: 0, transform: `scale(${scaleFrom})` }, { opacity: 1, transform: "scale(1)" }], { duration: 360, delay: delayFor(x), easing: spring, fill: "both" });
    };
    for (const halo of halos) animateDot(halo, Number(halo.getAttribute("cx")), .55);
    for (const point of points) animateDot(point, Number(point.getAttribute("cx")), .35);
    for (const label of labels) {
      const x = Number(label.getAttribute("x"));
      label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay: delayFor(x) + 80, easing, fill: "both" });
    }
    if (empty) empty.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 900, easing, fill: "both" });
  }
  function renderReview() {
    reviewTodayKey = todayKey();
    const now = Date.now();
    const records = reviewRecords(now);
    const dueRecords = records.filter(record => record.dueIndexes.length);
    reviewActiveCount.textContent = String(records.length);
    reviewDueCount.textContent = String(dueRecords.length);
    reviewCompleteCount.textContent = String(state.tasks.filter(task => task.completed && Array.isArray(task.reviews) && task.reviews.every(Boolean)).length);
    renderReviewDueList(records, dueRecords);
    renderReviewChart(records);
  }
  reviewDueList.addEventListener("click", event => {
    const check = event.target.closest(".review-check");
    if (!check || check.disabled) return;
    const card = check.closest(".review-card");
    const task = state.tasks.find(item => item.id === card?.dataset.id);
    const index = Number(check.dataset.index);
    if (!task || !Number.isInteger(index) || index < 0 || index >= REVIEW_INTERVALS.length) return;
    if (!task.completed || task.reviews[index] || completedDays(task) < REVIEW_INTERVALS[index]) return;
    task.reviews[index] = Date.now();
    const complete = task.reviews.every(Boolean);
    commit(complete ? "艾宾浩斯复习完成，已移出复习列表" : `已完成「${REVIEW_INTERVALS[index]}天」复习打卡`);
    if (workspaceView === "review") {
      const next = reviewDueList.querySelector(".review-check.is-due:not(:disabled)") || $("#review-due-title");
      next?.focus({ preventScroll: true });
    }
  });
  let reviewChartFrame = 0;
  let reviewChartNeedsAnimation = false;
  window.addEventListener("resize", () => {
    if (workspaceView !== "review") return;
    cancelAnimationFrame(reviewChartFrame);
    reviewChartFrame = requestAnimationFrame(() => renderReviewChart(reviewRecords()));
  });
  function clampFocusMinutes(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(FOCUS_MINUTES_MAX, Math.max(FOCUS_MINUTES_MIN, Math.round(number))) : FOCUS_MINUTES_DEFAULT;
  }
  function readFocusMinutesSetting() {
    try {
      const raw = localStorage.getItem(FOCUS_MINUTES_KEY);
      return raw === null || raw === "" ? FOCUS_MINUTES_DEFAULT : clampFocusMinutes(raw);
    } catch { return FOCUS_MINUTES_DEFAULT; }
  }
  function readFocusTaskIdSetting() {
    try { return localStorage.getItem(FOCUS_TASK_KEY) || ""; } catch { return ""; }
  }
  function pendingFocusTasks() {
    return state.tasks.filter(task => !task.completed).sort((a, b) => groupName(a.groupId).localeCompare(groupName(b.groupId), "zh-CN") || taskLabel(a).localeCompare(taskLabel(b), "zh-CN"));
  }
  function focusTaskDueText(task) {
    return task.dueDate ? `${task.dueDate.slice(5).replace("-", "/")} 截止` : "";
  }
  function persistFocusTaskId() {
    try {
      if (focusTaskId) localStorage.setItem(FOCUS_TASK_KEY, focusTaskId);
      else localStorage.removeItem(FOCUS_TASK_KEY);
    } catch { /* 存储不可用时仅本次生效 */ }
  }
  function updateFocusTaskPreview() {
    const task = state.tasks.find(item => item.id === focusTaskId && !item.completed);
    focusTaskPreview.hidden = !task;
    if (!task) return;
    focusTaskPreviewGroup.textContent = groupName(task.groupId);
    const due = focusTaskDueText(task);
    focusTaskPreviewDue.textContent = due;
    focusTaskPreviewDue.hidden = !due;
    const hasTitle = Boolean(task.title);
    const content = task.content && task.content !== task.title ? task.content : "";
    focusTaskPreviewTitle.textContent = hasTitle ? task.title : "";
    focusTaskPreviewTitle.hidden = !hasTitle;
    focusTaskPreviewContent.textContent = content;
    focusTaskPreviewContent.hidden = !content;
  }
  function syncFocusTaskOptions() {
    const pending = pendingFocusTasks();
    const signature = `${pending.map(task => `${task.id}\u0000${taskLabel(task)}\u0000${task.groupId || ""}\u0000${task.dueDate || ""}\u0000${task.content.length}`).join("\u0001")}|${state.groups.map(group => `${group.id}:${group.name}`).join(",")}`;
    if (signature !== focusTaskSignature) {
      focusTaskSignature = signature;
      const grouped = new Map();
      for (const task of pending) {
        const key = task.groupId || "";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(task);
      }
      const options = [element("option", "", pending.length ? "不关联待办" : "暂无可选待办")];
      options[0].value = "";
      for (const [id, name] of [["", "未分组"], ...state.groups.map(group => [group.id, group.name])]) {
        const tasks = grouped.get(id);
        if (!tasks?.length) continue;
        const group = element("optgroup");
        group.label = name;
        for (const task of tasks) {
          const option = element("option", "", `${taskLabel(task)}${task.dueDate ? ` · 截止 ${task.dueDate.slice(5).replace("-", "/")}` : ""}`);
          option.value = task.id;
          group.append(option);
        }
        options.push(group);
      }
      focusTaskSelect.replaceChildren(...options);
    }
    if (focusTaskId && !pending.some(task => task.id === focusTaskId)) {
      focusTaskId = "";
      persistFocusTaskId();
    }
    focusTaskSelect.disabled = pending.length === 0;
    focusTaskSelect.value = focusTaskId;
    updateFocusTaskPreview();
  }
  function renderFocusTaskOverlay(task) {
    focusOverlayTask.hidden = !task;
    if (!task) {
      focusOverlayTaskGroup.replaceChildren();
      focusOverlayTaskDue.hidden = true;
      focusOverlayTaskTitle.textContent = "";
      focusOverlayTaskContent.textContent = "";
      return;
    }
    focusOverlayTaskGroup.replaceChildren(icon(task.groupId ? "folder" : "inbox"), element("span", "", groupName(task.groupId)));
    const due = focusTaskDueText(task);
    focusOverlayTaskDue.textContent = due;
    focusOverlayTaskDue.hidden = !due;
    focusOverlayTaskTitle.textContent = task.title;
    focusOverlayTaskTitle.hidden = !task.title;
    focusOverlayTaskContent.textContent = task.content;
    focusOverlayTaskContent.hidden = !task.content || task.content === task.title;
    focusOverlayTask.setAttribute("aria-label", `当前专注待办：${taskLabel(task)}`);
    focusOverlayTask.scrollTop = 0;
    focusOverlayContent.scrollTop = 0;
  }
  function formatFocusClock(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function formatFocusElapsed(ms) {
    if (ms < 60000) return "不到 1 分钟";
    return `${Math.floor(ms / 60000)} 分钟`;
  }
  function updateFocusPreview() {
    focusDurationDisplay.textContent = `${String(focusMinutes).padStart(2, "0")}:00`;
    for (const button of focusPresetButtons) {
      const active = Number(button.dataset.minutes) === focusMinutes;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }
  function syncFocusSetup() {
    if (document.activeElement !== focusMinutesInput) focusMinutesInput.value = String(focusMinutes);
    focusStart.disabled = focusActive;
    updateFocusPreview();
    syncFocusTaskOptions();
  }
  function setFocusMinutes(value, persist = true) {
    focusMinutes = clampFocusMinutes(value);
    if (persist) { try { localStorage.setItem(FOCUS_MINUTES_KEY, String(focusMinutes)); } catch { /* 浏览器存储不可用时仅本次生效 */ } }
    syncFocusSetup();
  }
  function updateFocusClock() {
    if (!focusActive) return;
    const remaining = Math.max(0, focusEndAt - Date.now());
    const elapsed = Math.min(focusTotalMs, Math.max(0, focusTotalMs - remaining));
    focusCountdown.textContent = formatFocusClock(remaining);
    focusOverlayProgress.style.strokeDashoffset = String(FOCUS_RING_LENGTH * (focusTotalMs ? elapsed / focusTotalMs : 1));
    document.title = `${formatFocusClock(remaining)} · 专注中 · 一件`;
    if (remaining <= 0) finishFocus("complete");
  }
  function showFocusStatus(message) {
    if (!focusActive) return;
    focusOverlayStatus.textContent = message;
    focusOverlayStatus.hidden = false;
  }
  function hideFocusStatus() {
    focusOverlayStatus.hidden = true;
    focusOverlayStatus.textContent = "";
  }
  function lockFocusKeyboard() {
    try {
      const lock = navigator.keyboard?.lock?.(["Escape", "F11"]);
      lock?.catch?.(() => {});
    } catch { /* Keyboard Lock 不可用时仅依赖页面按键监听 */ }
  }
  function unlockFocusKeyboard() {
    try { navigator.keyboard?.unlock?.(); } catch { /* 忽略 */ }
  }
  async function requestFocusWakeLock() {
    if (!focusActive || document.hidden || !navigator.wakeLock?.request) return;
    try {
      focusWakeLock = await navigator.wakeLock.request("screen");
      focusWakeLock.addEventListener?.("release", () => { focusWakeLock = null; });
    } catch { focusWakeLock = null; }
  }
  function releaseFocusWakeLock() {
    try { focusWakeLock?.release?.(); } catch { /* 忽略 */ }
    focusWakeLock = null;
  }
  function requestFocusFullscreen() {
    if (!focusActive) return;
    if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== "function") {
      showFocusStatus("浏览器不支持全屏，专注界面仍会保留。");
      focusReenter.hidden = true;
      return;
    }
    let request;
    try {
      request = document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      showFocusStatus("未进入浏览器全屏，专注界面仍会保留。");
      focusReenter.hidden = false;
      return;
    }
    Promise.resolve(request).then(() => {
      hideFocusStatus();
      focusReenter.hidden = true;
      lockFocusKeyboard();
    }).catch(() => {
      showFocusStatus("未进入浏览器全屏，专注界面仍会保留。");
      focusReenter.hidden = false;
    });
  }
  function cancelEscapeHold() {
    if (focusEscapeTimer) { clearTimeout(focusEscapeTimer); focusEscapeTimer = 0; }
    focusHoldHint.hidden = true;
  }
  function beginEscapeHold() {
    cancelEscapeHold();
    focusHoldHint.textContent = "继续按住 Esc 3 秒结束专注…";
    focusHoldHint.hidden = false;
    focusEscapeTimer = setTimeout(() => finishFocus("escape-hold"), 3000);
  }
  function cancelExitHold() {
    if (focusHoldTimer) { clearTimeout(focusHoldTimer); focusHoldTimer = 0; }
    focusExit.classList.remove("is-holding");
    focusExitLabel.textContent = "按住 3 秒结束专注";
  }
  function beginExitHold() {
    if (!focusActive) return;
    cancelExitHold();
    focusExit.classList.add("is-holding");
    focusExitLabel.textContent = "继续按住…";
    focusHoldTimer = setTimeout(() => finishFocus("hold"), 3000);
  }
  function startFocus() {
    if (focusActive) return;
    focusMinutes = clampFocusMinutes(focusMinutesInput.value);
    setFocusMinutes(focusMinutes);
    focusTotalMs = focusMinutes * 60000;
    focusStartAt = Date.now();
    focusEndAt = focusStartAt + focusTotalMs;
    focusActive = true;
    focusStart.disabled = true;
    focusSessionHint.textContent = "专注进行中";
    focusFeedback.textContent = "专注进行中…";
    focusHoldHint.hidden = true;
    focusOverlayStatus.hidden = true;
    focusReenter.hidden = true;
    cancelEscapeHold();
    cancelExitHold();
    focusCountdown.textContent = formatFocusClock(focusTotalMs);
    focusOverlayTotal.textContent = `${focusMinutes} 分钟专注`;
    focusOverlayProgress.style.strokeDashoffset = "0";
    const selectedTask = state.tasks.find(task => task.id === focusTaskId && !task.completed);
    if (focusTaskId && !selectedTask) {
      focusTaskId = "";
      persistFocusTaskId();
      focusTaskSelect.value = "";
    }
    renderFocusTaskOverlay(selectedTask);
    focusOverlay.hidden = false;
    focusOverlayTask.scrollTop = 0;
    focusOverlayContent.scrollTop = 0;
    document.body.classList.add("focus-locked");
    document.querySelector(".app-shell").inert = true;
    focusOverlayContent.focus({ preventScroll: true });
    document.title = `${formatFocusClock(focusTotalMs)} · 专注中 · 一件`;
    focusTickTimer = setInterval(updateFocusClock, 250);
    requestFocusFullscreen();
    requestFocusWakeLock();
  }
  function finishFocus(reason) {
    if (!focusActive) return;
    focusActive = false;
    if (reason === "hold") focusClickShieldUntil = Date.now() + 500;
    const elapsed = Math.min(focusTotalMs, Math.max(0, Date.now() - focusStartAt));
    clearInterval(focusTickTimer);
    focusTickTimer = 0;
    clearTimeout(focusEscapeTimer);
    focusEscapeTimer = 0;
    clearTimeout(focusHoldTimer);
    focusHoldTimer = 0;
    focusHoldHint.hidden = true;
    focusExit.classList.remove("is-holding");
    focusExitLabel.textContent = "按住 3 秒结束专注";
    focusOverlay.hidden = true;
    focusOverlayStatus.hidden = true;
    focusReenter.hidden = true;
    document.body.classList.remove("focus-locked");
    document.querySelector(".app-shell").inert = false;
    focusStart.disabled = false;
    releaseFocusWakeLock();
    unlockFocusKeyboard();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    const completed = reason === "complete";
    focusSessionHint.textContent = completed ? "专注完成" : "已结束本次专注";
    focusFeedback.textContent = completed ? `本次专注 ${focusMinutes} 分钟完成，休息一下。` : `本次专注 ${formatFocusElapsed(elapsed)}，已结束。`;
    syncWorkspaceChrome();
    syncFocusSetup();
    focusStart.focus({ preventScroll: true });
    notify(completed ? "专注完成，辛苦了" : "已结束专注");
  }
  function isMetaEscape(event) {
    return event.key === "Escape" && (event.metaKey || event.getModifierState?.("Meta"));
  }
  function handleFocusKeydown(event) {
    if (!focusActive) return;
    if (event.key === "Escape") {
      if (isMetaEscape(event)) { event.preventDefault(); finishFocus("shortcut"); return; }
      event.preventDefault();
      if (!event.repeat) beginEscapeHold();
      return;
    }
    if (event.key === "F5" || event.key === "F11" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) event.preventDefault();
  }
  function handleFocusKeyup(event) {
    if (focusActive && event.key === "Escape") cancelEscapeHold();
  }
  for (const button of focusPresetButtons) button.addEventListener("click", () => setFocusMinutes(button.dataset.minutes));
  focusMinutesInput.addEventListener("input", () => {
    const value = focusMinutesInput.valueAsNumber;
    if (!Number.isFinite(value)) return;
    focusMinutes = clampFocusMinutes(value);
    updateFocusPreview();
    try { localStorage.setItem(FOCUS_MINUTES_KEY, String(focusMinutes)); } catch { /* 忽略 */ }
  });
  focusMinutesInput.addEventListener("change", () => setFocusMinutes(focusMinutesInput.value));
  focusTaskSelect.addEventListener("change", () => {
    const selected = focusTaskSelect.value;
    focusTaskId = state.tasks.some(task => task.id === selected && !task.completed) ? selected : "";
    persistFocusTaskId();
    focusTaskSelect.value = focusTaskId;
    updateFocusTaskPreview();
  });
  focusStart.addEventListener("click", startFocus);
  focusReenter.addEventListener("click", requestFocusFullscreen);
  focusExit.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    beginExitHold();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) focusExit.addEventListener(type, cancelExitHold);
  focusExit.addEventListener("keydown", event => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); beginExitHold(); }
  });
  focusExit.addEventListener("keyup", event => {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); cancelExitHold(); }
  });
  focusExit.addEventListener("blur", cancelExitHold);
  document.addEventListener("fullscreenchange", () => {
    if (!focusActive) return;
    if (document.fullscreenElement) { hideFocusStatus(); focusReenter.hidden = true; lockFocusKeyboard(); }
    else { showFocusStatus("已退出浏览器全屏，专注仍在继续。"); focusReenter.hidden = !document.fullscreenEnabled; }
  });
  window.addEventListener("keydown", handleFocusKeydown, true);
  window.addEventListener("keyup", handleFocusKeyup, true);
  document.addEventListener("click", event => {
    if (Date.now() >= focusClickShieldUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  window.addEventListener("beforeunload", event => {
    if (!focusActive) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelEscapeHold(); cancelExitHold(); }
    else if (focusActive) { updateFocusClock(); requestFocusWakeLock(); }
  });
  window.addEventListener("blur", () => {
    if (!focusActive) return;
    cancelEscapeHold();
    cancelExitHold();
  });
  focusMinutes = readFocusMinutesSetting();
  focusTaskId = readFocusTaskIdSetting();
  focusOverlayProgress.style.strokeDasharray = String(FOCUS_RING_LENGTH);
  function positionCalendarTooltip(anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = calendarTooltip.getBoundingClientRect();
    const margin = 12;
    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    left = Math.max(margin, Math.min(left, innerWidth - tipRect.width - margin));
    let top = anchorRect.bottom + 10;
    if (top + tipRect.height > innerHeight - margin) top = anchorRect.top - tipRect.height - 10;
    if (top < margin) top = Math.max(margin, Math.min(innerHeight - tipRect.height - margin, anchorRect.bottom + 10));
    calendarTooltip.style.left = `${Math.round(left)}px`;
    calendarTooltip.style.top = `${Math.round(top)}px`;
  }
  let calendarTooltipAnchor = null;
  function showCalendarTooltip(anchor) {
    const key = anchor.dataset.date;
    if (!key) return;
    const date = parseDateKey(key);
    const tasks = calendarDueIndex.get(key) || [];
    const head = element("div", "calendar-tooltip-head");
    head.append(element("strong", "calendar-tooltip-date", `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${CALENDAR_WEEKDAYS[date.getDay()]}`), element("span", "calendar-tooltip-count", tasks.length ? `${tasks.length} 件截止` : "无截止待办"));
    const fragment = document.createDocumentFragment();
    fragment.append(head);
    if (!tasks.length) fragment.append(element("p", "calendar-tooltip-empty", "这一天没有待办截止。"));
    else {
      const list = element("div", "calendar-tooltip-list");
      for (const task of tasks) {
        const row = element("div", `calendar-tooltip-task${task.completed ? " is-done" : rules.isUrgent(task) ? " is-urgent" : ""}`);
        row.append(element("strong", "", taskLabel(task)));
        if (task.content && task.content !== taskLabel(task)) row.append(element("p", "", task.content));
        row.append(element("div", "calendar-tooltip-meta", calendarTaskMeta(task)));
        list.append(row);
      }
      fragment.append(list);
    }
    calendarTooltip.replaceChildren(fragment);
    calendarTooltip.dataset.date = key;
    calendarTooltip.hidden = false;
    calendarTooltipAnchor = anchor;
    positionCalendarTooltip(anchor);
  }
  function hideCalendarTooltip() {
    if (!calendarTooltip) return;
    calendarTooltip.hidden = true;
    calendarTooltipAnchor = null;
    delete calendarTooltip.dataset.date;
  }
  function syncCalendarTooltipPosition() {
    if (!calendarTooltip || calendarTooltip.hidden) return;
    const anchor = calendarTooltipAnchor;
    const rect = anchor?.getBoundingClientRect();
    if (!anchor?.isConnected || !rect || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
      hideCalendarTooltip();
      return;
    }
    positionCalendarTooltip(anchor);
  }
  function selectCalendarDate(key) {
    const date = parseDateKey(key);
    const monthChanged = date.getFullYear() !== calendarCursor.getFullYear() || date.getMonth() !== calendarCursor.getMonth();
    const direction = monthChanged ? (date < calendarCursor ? -1 : 1) : null;
    calendarSelected = key;
    calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1);
    renderCalendar(direction);
    [...calendarGrid.querySelectorAll(".calendar-day-number")].find(node => node.dataset.date === key)?.focus({ preventScroll: true });
  }
  function shiftCalendarMonth(delta) {
    const selected = parseDateKey(calendarSelected);
    const cursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    calendarCursor = cursor;
    calendarSelected = localDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(selected.getDate(), daysInMonth(cursor))));
    renderCalendar(Math.sign(delta));
  }
  function goCalendarToday() {
    const today = new Date();
    const direction = Math.sign((today.getFullYear() * 12 + today.getMonth()) - (calendarCursor.getFullYear() * 12 + calendarCursor.getMonth()));
    calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    calendarSelected = todayKey();
    renderCalendar(direction);
    [...calendarGrid.querySelectorAll(".calendar-day-number")].find(node => node.dataset.date === calendarSelected)?.focus({ preventScroll: true });
  }
  $("#calendar-prev").addEventListener("click", () => shiftCalendarMonth(-1));
  $("#calendar-next").addEventListener("click", () => shiftCalendarMonth(1));
  $("#calendar-today").addEventListener("click", goCalendarToday);
  calendarGrid.addEventListener("click", event => {
    const cell = event.target.closest(".calendar-day");
    if (cell) selectCalendarDate(cell.dataset.date);
  });
  calendarGrid.addEventListener("pointerover", event => {
    const number = event.target.closest(".calendar-day-number");
    if (number) showCalendarTooltip(number);
  });
  calendarGrid.addEventListener("pointerout", event => {
    const number = event.target.closest(".calendar-day-number");
    if (!number || (event.relatedTarget && number.contains(event.relatedTarget))) return;
    hideCalendarTooltip();
  });
  calendarGrid.addEventListener("focusin", event => {
    const number = event.target.closest(".calendar-day-number");
    if (number) showCalendarTooltip(number);
  });
  calendarGrid.addEventListener("focusout", event => {
    if (event.target.closest(".calendar-day-number")) hideCalendarTooltip();
  });
  calendarGrid.addEventListener("keydown", event => {
    const number = event.target.closest(".calendar-day-number");
    if (!number) return;
    const date = parseDateKey(number.dataset.date);
    let next = null;
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (steps[event.key]) next = addCalendarDays(date, steps[event.key]);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const targetMonth = new Date(date.getFullYear(), date.getMonth() + (event.key === "PageUp" ? -1 : 1), 1);
      next = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(date.getDate(), daysInMonth(targetMonth)));
    } else if (event.key === "Home") next = parseDateKey(todayKey());
    else return;
    event.preventDefault();
    const monthChanged = next.getFullYear() !== date.getFullYear() || next.getMonth() !== date.getMonth();
    calendarSelected = localDateKey(next);
    calendarCursor = new Date(next.getFullYear(), next.getMonth(), 1);
    renderCalendar(monthChanged ? (next < date ? -1 : 1) : null);
    [...calendarGrid.querySelectorAll(".calendar-day-number")].find(node => node.dataset.date === calendarSelected)?.focus({ preventScroll: true });
  });
  $("#calendar-agenda-list").addEventListener("click", event => {
    const target = event.target.closest("[data-task-id]");
    if (!target) return;
    const task = state.tasks.find(item => item.id === target.dataset.taskId);
    if (task) openEditor(task, "calendar");
  });
  window.addEventListener("scroll", syncCalendarTooltipPosition, { passive: true });
  window.addEventListener("resize", syncCalendarTooltipPosition);
  document.addEventListener("keydown", event => { if (event.key === "Escape") hideCalendarTooltip(); });
  async function connectLocal() {
    if (!["http:", "https:"].includes(location.protocol)) {
      showFileHelp();
      $("#connection-warning").hidden = false;
      return;
    }
    const before = state.modifiedAt;
    try {
      const response = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("本地服务未连接");
      const data = await response.json();
      saveToken = data.token;
      diskRevision = data.revision;
      localAvailable = true;
      $("#save-path").textContent = data.path;
      $("#save-path").title = data.path;
      $("#connection-warning").hidden = true;
      if (data.state) {
        const disk = normalize(data.state);
        diskModifiedAt = disk.modifiedAt;
        diskState = cloneWorkspace(disk);
        if (state.modifiedAt === before && disk.modifiedAt >= state.modifiedAt) { state = disk; writeBrowser(); render(); }
      } else {
        diskModifiedAt = 0;
        diskState = emptyWorkspace();
      }
    } catch (error) {
      localAvailable = false;
      $("#connection-warning").textContent = `本地保存服务暂不可用：${error.message}。请通过「启动待办.cmd」打开；更改仍会保存在浏览器中。`;
      $("#connection-warning").hidden = false;
    }
    updateSaveStatus();
  }
  function showFileHelp() {
    const link = element("a", "local-service-link", "打开本地保存页面（携带当前待办）↗");
    link.href = "http://127.0.0.1:4173/";
    link.target = "_blank";
    link.rel = "noopener";
    link.addEventListener("click", () => { link.href = `http://127.0.0.1:4173/#transfer=${encodeURIComponent(JSON.stringify(state))}`; });
    $("#connection-warning").replaceChildren(document.createTextNode("当前直接打开的是 HTML 文件。请先双击同目录的「启动待办.cmd」，再点击此处进入支持本地保存的页面："), link);
  }
  function receiveTransfer() {
    if (!location.hash.startsWith("#transfer=") || !["http:", "https:"].includes(location.protocol)) return;
    try {
      const incoming = normalize(JSON.parse(decodeURIComponent(location.hash.slice(10))));
      const groupMap = new Map();
      for (const group of incoming.groups) {
        const existing = state.groups.find(item => item.name.toLowerCase() === group.name.toLowerCase());
        if (existing) groupMap.set(group.id, existing.id);
        else {
          const id = state.groups.some(item => item.id === group.id) ? makeId() : group.id;
          state.groups.push({ id, name: group.name });
          groupMap.set(group.id, id);
        }
      }
      for (const task of incoming.tasks) {
        const imported = { ...task, groupId: groupMap.get(task.groupId) || null };
        const index = state.tasks.findIndex(item => item.id === task.id);
        if (index >= 0) state.tasks[index] = imported;
        else state.tasks.push(imported);
      }
      for (const task of incoming.dailyTasks) {
        const index = state.dailyTasks.findIndex(item => item.id === task.id);
        if (index >= 0) state.dailyTasks[index] = task;
        else if (state.dailyTasks.length < 500) state.dailyTasks.push(task);
      }
      history.replaceState(null, "", location.pathname + location.search);
      commit("已带入 HTML 页面的待办，点击「本地保存」即可存入文档文件夹");
    } catch { notify("待办导入失败，原 HTML 页面的数据仍在，请保留原页面"); }
  }
  async function saveLocal() {
    if (saving) return;
    if (!localAvailable) await connectLocal();
    if (!localAvailable) { notify("请先运行「启动待办.cmd」，再使用本地保存"); return; }
    const snapshot = JSON.stringify(state);
    saving = true;
    $("#save-button").disabled = true;
    updateSaveStatus();
    try {
      const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json", "X-Todo-Token": saveToken }, body: JSON.stringify({ state: JSON.parse(snapshot), revision: diskRevision }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      diskRevision = result.revision;
      diskModifiedAt = JSON.parse(snapshot).modifiedAt;
      diskState = normalize(JSON.parse(snapshot));
      $("#connection-warning").hidden = true;
      notify(`已保存到 ${result.path}`);
      if (result.warnings?.length) {
        $("#connection-warning").textContent = result.warnings.join("；");
        $("#connection-warning").hidden = false;
      }
    } catch (error) {
      notify(`本地保存失败：${error.message}`);
      $("#connection-warning").textContent = `本地保存失败：${error.message}。当前更改仍保留在浏览器中。`;
      $("#connection-warning").hidden = false;
    } finally {
      saving = false;
      $("#save-button").disabled = false;
      updateSaveStatus();
    }
  }
  $("#save-button").addEventListener("click", saveLocal);
  document.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveLocal(); } });
  window.addEventListener("storage", event => {
    if (event.key === BACKGROUND_KEY) { applyBackground(event.newValue || ""); return; }
    if (event.key === CARD_BLUR_KEY) { cardBlur = event.newValue === null || event.newValue === "" ? CARD_BLUR_DEFAULT : normalizeCardBlur(event.newValue); syncBackgroundBlur(); return; }
    if (event.key === CARD_TRANSPARENCY_KEY) { cardTransparency = event.newValue === null || event.newValue === "" ? CARD_TRANSPARENCY_DEFAULT : normalizeCardTransparency(event.newValue); syncCardTransparency(); return; }
    if (event.key === BACKGROUND_BLUR_KEY) {
      backgroundBlur = event.newValue === null || event.newValue === "" ? BACKGROUND_BLUR_DEFAULT : normalizeBackgroundBlur(event.newValue);
      syncBackgroundBlur();
      return;
    }
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { const latest = normalize(JSON.parse(event.newValue)); if (latest.modifiedAt >= state.modifiedAt) { state = latest; render(); if ($("#daily-dialog").open) renderDaily(); } } catch { /* Keep current data when another tab has invalid storage. */ }
  });
  const updateDate = () => { $("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date()); };
  function refreshPriorities() {
    if (prioritySignature !== getPrioritySignature()) {
      const focused = document.activeElement;
      const card = focused?.closest(".task-card");
      render(card ? { id: card.dataset.id, area: card.dataset.area, action: focused.dataset.action || "move" } : null);
    }
  }
  $("#urgent-prev").addEventListener("click", () => advanceUrgent(-1));
  $("#urgent-next").addEventListener("click", () => advanceUrgent(1));
  $("#urgent-pause").addEventListener("click", () => { urgentPaused = !urgentPaused; renderUrgent(); });
  $("#urgent-section").addEventListener("mouseenter", () => { urgentHovered = true; });
  $("#urgent-section").addEventListener("mouseleave", () => { urgentHovered = false; });
  setInterval(() => {
    if ($("#daily-dialog").open && dailyDate !== todayKey()) renderDaily();
    if (workspaceView === "calendar" && !document.hidden && todayKey() !== calendarTodayKey) renderCalendar();
    if (workspaceView === "review" && !document.hidden && todayKey() !== reviewTodayKey) renderReview();
    refreshPriorities();
    if (!document.hidden && !urgentPaused && !urgentHovered && !draggingId && !document.querySelector("dialog[open]") && !$("#urgent-section").contains(document.activeElement)) advanceUrgent(1);
  }, 3000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshPriorities(); if (workspaceView === "review" && todayKey() !== reviewTodayKey) renderReview(); } });
  updateDate();
  window.addEventListener("focus", () => {
    updateDate();
    refreshPriorities();
    if (workspaceView === "calendar" && todayKey() !== calendarTodayKey) renderCalendar();
    if (workspaceView === "review" && todayKey() !== reviewTodayKey) renderReview();
  });
  readBrowser();
  writeBrowser();
  render();
  connectLocal().then(receiveTransfer);
})();
