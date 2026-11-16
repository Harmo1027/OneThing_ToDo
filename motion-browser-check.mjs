import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTodoServer } from "./server.mjs";
import { openTodo, openCalendar } from "./test-browser-helpers.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TODO_PLAYWRIGHT || "C:/Users/Harmo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const parent = new URL("./.test-data/", import.meta.url);
await mkdir(parent, { recursive: true });
const dataDirectory = await mkdtemp(path.join(fileURLToPath(parent), "motion-"));
const server = createTodoServer({ dataDirectory });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const style = (page, selector, property, pseudo = null) => page.locator(selector).first().evaluate((el, [name, pseudo]) => getComputedStyle(el, pseudo)[name], [property, pseudo]);
const animationName = (page, selector, pseudo = null) => style(page, selector, "animationName", pseudo);
const hasClass = (page, selector, className) => page.locator(selector).first().evaluate((el, name) => el.classList.contains(name), className);
const translateY = async (page, selector) => {
  const value = await style(page, selector, "translate");
  const numbers = String(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [0, 0];
  return numbers[1] ?? 0;
};
let browser;
try {
  browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);

  assert.equal(await animationName(page, ".sidebar"), "none", "刷新时侧栏静止");
  assert.equal(await animationName(page, ".topbar"), "none", "刷新时顶栏静止");
  assert.equal(await animationName(page, ".app-footer"), "none", "刷新时页脚静止");
  const frost = page.locator(".page-frost");
  const waitForClear = () => frost.waitFor({ state: "hidden" });
  const assertFrost = async () => {
    assert.equal(await frost.count(), 1, "始终只使用一个工作区遮罩");
    assert.equal(await frost.isVisible(), true, "页面切换触发工作区毛玻璃");
    const motion = await frost.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const animation = node.getAnimations()[0];
      const root = document.querySelector('.app-shell').dataset.workspace === 'calendar' ? document.querySelector('#calendar-view') : document.querySelector('#todo-view');
      const workspace = root.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, workspaceLeft: workspace.left, workspaceTop: Math.max(0, workspace.top), workspaceBottom: Math.min(innerHeight, workspace.bottom), sidebarRight: document.querySelector('.sidebar').getBoundingClientRect().right, pointerEvents: getComputedStyle(node).pointerEvents, easing: animation.effect.getTiming().easing, duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes() };
    });
    assert.ok(Math.abs(motion.left - motion.workspaceLeft) < 1);
    assert.ok(motion.left >= motion.sidebarRight, "侧边栏不在模糊范围内");
    assert.ok(Math.abs(motion.top - motion.workspaceTop) < 1, "顶栏保持清晰");
    assert.ok(Math.abs(motion.bottom - motion.workspaceBottom) < 1);
    assert.equal(motion.pointerEvents, "none", "过渡不阻塞点击");
    assert.equal(motion.easing, "cubic-bezier(0.22, 0.61, 0.36, 1)");
    assert.equal(motion.duration, 1200, "模糊时长 1.2 秒");
    assert.equal(motion.frames[0].backdropFilter, "blur(14px)");
    assert.equal(motion.frames.at(-1).backdropFilter, "blur(0px)");
  };
  assert.equal(await animationName(page, "#calendar-view"), "none", "工作区毛玻璃接管页面过渡");
  await page.waitForTimeout(900);

  await page.reload();
  await assertFrost();
  await page.waitForTimeout(40);
  const refreshMotion = await page.locator("#calendar-month-title").evaluate(node => {
    const animation = node.getAnimations().find(item => item.effect.getTiming().duration === 600);
    animation.pause();
    const positions = [0, 150, 300, 450, 599].map(time => {
      animation.currentTime = time;
      return node.getBoundingClientRect().top;
    });
    animation.finish();
    return positions;
  });
  assert.ok(refreshMotion.every((top, index) => index === 0 || top <= refreshMotion[index - 1] + .1), "刷新入场只向目标位置移动，不反向弹跳");
  for (const selector of [".sidebar", ".topbar", ".app-footer", ".workspace-button.active>svg", ".theme-moon"]) {
    assert.equal(await animationName(page, selector), "none", `刷新后 ${selector} 无回弹`);
  }
  await waitForClear();
  await page.waitForTimeout(120);
  assert.equal(await animationName(page, "#calendar-agenda-empty"), "none", "工作区入场结束后不再触发第二次入场");
  await page.screenshot({ path: path.join(dataDirectory, "refresh-settled.png") });

  await openTodo(page);
  await assertFrost();
  await page.waitForTimeout(700);
  await openCalendar(page);
  await assertFrost();
  await page.waitForTimeout(700);

  await page.locator("#add-group-button").click();
  assert.equal(await animationName(page, "#group-dialog"), "dialog-spring-in", "弹窗回弹入场");
  assert.equal(await animationName(page, "#group-dialog", "::backdrop"), "backdrop-soften", "遮罩柔化过渡");
  await page.locator("#group-dialog").press("Escape");
  await page.locator("#group-dialog").waitFor({ state: "hidden" });

  await openTodo(page);
  await page.waitForTimeout(700);
  await page.locator('#system-groups [data-group-id="ungrouped"]').click();
  await assertFrost();
  await page.locator('#system-groups [data-group-id="special:homework"]').click();
  await page.locator('#system-groups [data-group-id="all"]').click();
  await assertFrost();
  await frost.evaluate(node => { const animation = node.getAnimations()[0]; animation.pause(); animation.currentTime = 0; });
  await page.waitForTimeout(40);
  const entrance = await page.locator("#todo-view").evaluate(root => [...root.querySelectorAll('*')].flatMap(node => node.getAnimations().filter(animation => animation.effect.getTiming().duration === 600 && /12px/.test(animation.effect.getKeyframes()[0].translate)).map(animation => ({ tag: node.tagName, top: node.getBoundingClientRect().top, delay: animation.effect.getTiming().delay, end: animation.effect.getTiming().delay + animation.effect.getTiming().duration }))));
  assert.ok(entrance.some(item => item.tag === "H1"), "标题参与浮现");
  assert.ok(entrance.some(item => item.tag === "BUTTON"), "按钮参与浮现");
  assert.ok(entrance.every(item => item.end <= 1200), "分批入场在 1.2 秒内结束");
  assert.ok(Math.max(...entrance.map(item => item.delay)) > 500, "由上到下错开浮现时间");
  const startBlur = await style(page, ".page-frost", "backdropFilter");
  await page.screenshot({ path: path.join(dataDirectory, "frost-start.png") });
  await frost.evaluate(node => { node.getAnimations()[0].currentTime = 600; });
  const middleBlur = await style(page, ".page-frost", "backdropFilter");
  assert.ok(parseFloat(middleBlur.slice(5)) < parseFloat(startBlur.slice(5)) / 2, "毛玻璃前半段迅速渐弱，后半段柔和收尾");
  await page.screenshot({ path: path.join(dataDirectory, "frost-middle.png") });
  await frost.evaluate(node => node.getAnimations()[0].finish());
  await waitForClear();
  assert.equal(await frost.evaluate(node => node.getAnimations().length), 0, "快速切换后释放遮罩动画");
  await page.locator('#system-groups [data-group-id="all"]').click();
  assert.equal(await frost.isVisible(), false, "重复选中当前分组不重播");

  await page.locator("#task-heading").fill("回弹卡片");
  await page.locator("#task-input").fill("悬停时上浮，完成与置顶时落位。");
  await page.locator("#add-form .add-button").click();
  const card = page.locator("#task-list .task-card").filter({ hasText: "回弹卡片" });
  assert.equal(await card.count(), 1);
  assert.equal(await page.locator("#toast").evaluate(el => el.classList.contains("visible")), true, "新增待办提示出现");
  assert.match(await style(page, "#toast", "transitionTimingFunction"), /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/, "提示条使用回弹过渡");
  await page.waitForTimeout(650);
  assert.equal(await style(page, "#toast", "filter"), "none", "提示条淡入后清除模糊");
  assert.equal(await page.locator("#toast").evaluate(el => el.classList.contains("visible")), true);

  await page.locator('#system-groups [data-group-id="ungrouped"]').click();
  await assertFrost();
  await page.waitForTimeout(40);
  const cardEntrance = await card.evaluate(node => node.getAnimations().find(animation => animation.effect.getTiming().duration === 600)?.effect.getTiming());
  const headingEntrance = await page.locator("#page-title").evaluate(node => node.getAnimations().find(animation => animation.effect.getTiming().duration === 600)?.effect.getTiming());
  assert.ok(cardEntrance && headingEntrance && cardEntrance.delay > headingEntrance.delay, "卡片在上方标题之后浮现");
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(40);
  await assertFrost();
  await waitForClear();
  assert.equal(await card.evaluate(node => node.getAnimations().some(animation => animation.effect.getTiming().duration === 600)), false, "入场结束后释放卡片动画，不占用悬停位移");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await card.hover();
  await page.waitForTimeout(600);
  assert.ok(Number(await style(page, "#task-list .task-card", "scale")) > 1.02, "卡片非线性放大");
  assert.match(await style(page, "#task-list .task-card", "transitionTimingFunction"), /1\.56/, "缩放使用回弹曲线");
  assert.ok(await translateY(page, "#task-list .task-card") <= -3.5, "卡片悬停上浮到 -4px");
  await page.mouse.move(4, 4);
  await page.waitForTimeout(650);
  assert.ok(Math.abs(await translateY(page, "#task-list .task-card")) < 0.5, "移开后卡片回落");
  const restingScale = await style(page, "#task-list .task-card", "scale");
  assert.ok(restingScale === "none" || Math.abs(Number(restingScale) - 1) < .001, "移开后恢复卡片原尺寸");
  await page.locator("#save-button").hover();
  await page.waitForTimeout(550);
  assert.ok(Number(await style(page, "#save-button", "scale")) > 1.05, "按钮悬停放大");
  await page.mouse.move(4, 4);

  await card.locator(".pin-button").click();
  const pinnedCard = page.locator("#pinned-list .task-card").filter({ hasText: "回弹卡片" });
  assert.equal(await pinnedCard.count(), 1);
  assert.equal(await hasClass(page, "#pinned-list .task-card", "is-landing"), true, "置顶后卡片回弹落位");
  assert.equal(await animationName(page, "#pinned-list .task-card"), "card-land-spring");
  await page.waitForFunction(() => !document.querySelector("#pinned-list .task-card.is-landing"), null, { timeout: 3000 });
  assert.equal(await pinnedCard.locator(".pin-button").getAttribute("aria-pressed"), "true");

  await page.locator('#system-groups [data-group-id="ungrouped"]').click();
  await card.locator(".complete-button").click();
  const completedCard = page.locator("#completed-list .task-card").filter({ hasText: "回弹卡片" });
  assert.equal(await completedCard.count(), 1);
  assert.equal(await hasClass(page, "#completed-list .task-card", "is-landing"), true, "完成后卡片在已完成区回弹落位");
  assert.equal(await animationName(page, "#completed-list .task-card"), "card-land-spring");
  assert.equal(await animationName(page, "#completed-section"), "none", "区块不叠加旧入场动画");
  await page.waitForFunction(() => !document.querySelector("#completed-list .task-card.is-landing"), null, { timeout: 3000 });

  const todayKey = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  await page.locator("#task-heading").fill("日历回弹");
  await page.locator("#task-due-date").fill(todayKey);
  await page.locator("#add-form .add-button").click();
  assert.equal(await page.locator("#task-list .task-card").filter({ hasText: "日历回弹" }).count(), 1);

  await openCalendar(page);
  await page.waitForTimeout(700);
  assert.equal(await hasClass(page, "#calendar-grid", "is-month-entering"), false);
  await page.locator("#calendar-next").click();
  await assertFrost();
  await waitForClear();
  await page.locator("#calendar-prev").click();
  await assertFrost();
  await waitForClear();
  await page.locator("#theme-toggle").click();
  await assertFrost();
  await waitForClear();

  await page.locator(".calendar-day.is-today .calendar-day-number").hover();
  await page.locator("#calendar-tooltip").waitFor({ state: "visible" });
  assert.equal(await animationName(page, "#calendar-tooltip"), "tooltip-spring-in", "日期提示柔和弹出");
  assert.match(await page.locator("#calendar-tooltip").textContent(), /日历回弹/);
  await page.mouse.move(4, 4);
  await page.locator("#calendar-tooltip").waitFor({ state: "hidden" });

  assert.equal(await animationName(page, "#calendar-agenda-list li"), "none", "议程不重播旧的回弹动画");
  assert.match(await style(page, "#calendar-agenda-list li", "filter"), /none|blur/);

  await page.setViewportSize({ width: 375, height: 812 });
  await openTodo(page);
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "入场动画开始时水平溢出");
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "入场动画回弹时水平溢出");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "入场动画中段水平溢出");
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "入场动画结束后水平溢出");
  await page.setViewportSize({ width: 320, height: 812 });
  await openCalendar(page);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "320px 日历入场无水平溢出");
  await page.waitForTimeout(700);

  const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Shanghai", reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  const reducedErrors = [];
  reducedPage.on("pageerror", error => reducedErrors.push(error.message));
  await reducedPage.goto(base);
  assert.equal(await animationName(reducedPage, ".sidebar"), "none", "减弱动效时禁用侧栏动画");
  assert.equal(await animationName(reducedPage, "#calendar-view"), "none", "减弱动效时禁用视图动画");
  assert.equal(await style(reducedPage, "#calendar-view", "transitionDuration"), "0s", "减弱动效时禁用过渡");
  await openCalendar(reducedPage);
  await reducedPage.locator("#calendar-next").click();
  assert.equal(await hasClass(reducedPage, "#calendar-grid", "is-month-entering"), false, "减弱动效时不添加翻月动画类");
  assert.equal(await animationName(reducedPage, "#calendar-grid"), "none");
  await openTodo(reducedPage);
  assert.equal(await reducedPage.locator(".page-frost").isVisible(), false, "减弱动态效果时无全局遮罩");
  await reducedPage.locator("#task-heading").fill("静态任务");
  await reducedPage.locator("#add-form .add-button").click();
  const reducedCard = reducedPage.locator("#task-list .task-card").filter({ hasText: "静态任务" });
  assert.equal(await reducedCard.count(), 1);
  assert.equal(await style(reducedPage, "#task-list .task-card", "transitionDuration"), "0s");
  await reducedCard.hover();
  assert.equal(await style(reducedPage, "#task-list .task-card", "scale"), "none", "减弱动态效果时不缩放卡片");
  await reducedCard.locator(".complete-button").click();
  const reducedCompleted = reducedPage.locator("#completed-list .task-card").filter({ hasText: "静态任务" });
  assert.equal(await reducedCompleted.count(), 1);
  assert.equal(await hasClass(reducedPage, "#completed-list .task-card", "is-landing"), false, "减弱动效时跳过落位动画");
  assert.equal(await animationName(reducedPage, "#completed-list .task-card"), "none");
  await reducedPage.locator("#add-group-button").click();
  assert.equal(await animationName(reducedPage, "#group-dialog"), "none", "减弱动效时弹窗无动画");
  await reducedPage.locator("#group-dialog").press("Escape");
  await reducedContext.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(reducedErrors, []);
  console.log("PASS: 工作区 1.2 秒非线性毛玻璃与刷新无弹跳、侧边栏与顶栏清晰、文字/按钮从上到下浮现、分组/工作空间/翻月/主题切换、快速连点清理、卡片按钮放大回弹、320–375px 无溢出、减弱动效兼容。");
  console.log(`Data: ${dataDirectory}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
