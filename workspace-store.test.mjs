import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, validateState } from "./workspace-store.mjs";
import { createTodoServer } from "./server.mjs";

const fixture = () => ({ version: 2, modifiedAt: Date.now(), groups: [{ id: "group-work", name: "工作" }, { id: "group-study", name: "学习" }], tasks: [{ id: "task-root", title: "未分组任务", groupId: null, createdAt: 1000, pinnedAt: 0 }, { id: "task-work", title: "分组与置顶", groupId: "group-work", createdAt: 2000, pinnedAt: 3000 }] });
async function sandbox() {
  const parent = new URL("./.test-data/", import.meta.url);
  await mkdir(parent, { recursive: true });
  return mkdtemp(path.join(fileURLToPath(parent), "store-"));
}

test("按分组保存、空分组建目录、完整恢复、移动与删除清理，保留用户文件", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  assert.deepEqual(await store.load(), { state: null, revision: 0 });
  const state = fixture();
  const saved = await store.save(state, 0);
  await access(path.join(directory, "task-root.todo.json"));
  await access(path.join(directory, "工作", "task-work.todo.json"));
  await access(path.join(directory, "学习"));
  assert.deepEqual((await store.load()).state, validateState(state));
  await writeFile(path.join(directory, "工作", "notes.txt"), "keep me");
  state.tasks[1].groupId = "group-study";
  state.tasks = state.tasks.filter(task => task.id !== "task-root");
  state.modifiedAt++;
  await store.save(state, saved.revision);
  await access(path.join(directory, "学习", "task-work.todo.json"));
  await assert.rejects(access(path.join(directory, "工作", "task-work.todo.json")));
  await assert.rejects(access(path.join(directory, "task-root.todo.json")));
  assert.equal(await readFile(path.join(directory, "工作", "notes.txt"), "utf8"), "keep me");
  assert.equal((await store.load()).state.tasks[0].pinnedAt, 3000);
});

test("特殊分组独立保存，可同时存在且不创建文件夹或移动文件", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const saved = await store.save(fixture(), 0);
  const restored = (await store.load()).state;
  assert.equal(restored.tasks[0].homework, false);
  assert.equal(restored.tasks[0].longTerm, false);
  const before = (await readdir(directory, { recursive: true })).sort();
  for (const task of restored.tasks) { task.homework = true; task.longTerm = true; }
  restored.modifiedAt++;
  const updated = await store.save(restored, saved.revision);
  assert.deepEqual((await readdir(directory, { recursive: true })).sort(), before);
  assert.deepEqual((await store.load()).state, restored);
  for (const [filename, groupId] of [["task-root.todo.json", null], [path.join("工作", "task-work.todo.json"), "group-work"]]) {
    const { task } = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
    assert.equal(task.homework, true);
    assert.equal(task.longTerm, true);
    assert.equal(task.groupId, groupId);
  }
  restored.tasks[0].longTerm = false;
  await store.save(restored, updated.revision);
  assert.deepEqual((await readdir(directory, { recursive: true })).sort(), before);
  assert.equal((await store.load()).state.tasks[0].homework, true);
  assert.equal((await store.load()).state.tasks[0].longTerm, false);
  for (const field of ["homework", "longTerm"]) for (const invalid of [null, "true", 1, [], {}]) {
    const bad = structuredClone(restored);
    bad.tasks[0][field] = invalid;
    assert.throws(() => validateState(bad), /特殊分组/);
  }
});

test("拒绝目录穿越、Windows 保留名称、重复分组以及无效任务", async () => {
  const store = createStore(await sandbox());
  for (const name of ["../outside", "工作/子目录", "CON", "con.txt", "LPT0", ".hidden", "test.", "未分组", " 工作"]) {
    const state = fixture();
    state.groups[0].name = name;
    await assert.rejects(store.save(state, 0));
  }
  const duplicate = fixture();
  duplicate.groups[1].name = duplicate.groups[0].name;
  await assert.rejects(store.save(duplicate, 0));
  const badTask = fixture();
  badTask.tasks[0].id = "../../escape";
  await assert.rejects(store.save(badTask, 0));
});

test("标题、正文、折叠状态保存恢复，兼容旧待办且拒绝无效内容", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const state = fixture();
  state.tasks[0] = { ...state.tasks[0], title: "每周学习计划", content: "第一项\n第二项", collapsed: true };
  const saved = await store.save(state, 0);
  const restored = (await store.load()).state;
  assert.equal(restored.tasks[0].title, "每周学习计划");
  assert.equal(restored.tasks[0].content, "第一项\n第二项");
  assert.equal(restored.tasks[0].collapsed, true);
  assert.equal(restored.tasks[1].title, "");
  assert.equal(restored.tasks[1].content, "分组与置顶");
  const file = JSON.parse(await readFile(path.join(directory, "task-root.todo.json"), "utf8"));
  assert.equal(file.task.collapsed, true);
  restored.tasks[0].title = "已编辑标题";
  restored.tasks[0].content = "";
  await store.save(restored, saved.revision);
  assert.equal((await store.load()).state.tasks[0].title, "已编辑标题");
  for (const invalid of [{ title: "", content: "  " }, { title: "a".repeat(121), content: "" }, { title: "正常", content: 123 }, { title: "正常", content: "a".repeat(5001) }, { collapsed: "true" }]) {
    const bad = structuredClone(restored);
    Object.assign(bad.tasks[0], invalid);
    assert.throws(() => validateState(bad));
  }
});

test("旧版本保存被拒绝，文件冲突不覆盖已有内容，损坏索引不静默清空", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const state = fixture();
  const saved = await store.save(state, 0);
  await assert.rejects(store.save(state, 0), error => error.statusCode === 409);
  state.tasks.push({ id: "task-existing", title: "不覆盖", groupId: null, createdAt: 5000, pinnedAt: 0 });
  const occupied = path.join(directory, "task-existing.todo.json");
  await writeFile(occupied, "user content");
  await assert.rejects(store.save(state, saved.revision));
  assert.equal(await readFile(occupied, "utf8"), "user content");
  assert.equal((await store.load()).state.tasks.length, 2);
  await writeFile(path.join(directory, ".todo-workspace.json"), "invalid JSON");
  await assert.rejects(store.load());
  await assert.rejects(store.save(fixture(), saved.revision));
});

test("截止日期与优先级保存恢复，旧任务默认为一般且无日期", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const state = fixture();
  state.tasks[0] = { ...state.tasks[0], dueDate: "2026-11-12", priority: "urgent" };
  const saved = await store.save(state, 0);
  const restored = (await store.load()).state;
  assert.equal(restored.tasks[0].dueDate, "2026-11-12");
  assert.equal(restored.tasks[0].priority, "urgent");
  assert.equal(restored.tasks[1].dueDate, null);
  assert.equal(restored.tasks[1].priority, "normal");
  const file = JSON.parse(await readFile(path.join(directory, "task-root.todo.json"), "utf8"));
  assert.equal(file.task.dueDate, "2026-11-12");
  restored.tasks[0].dueDate = null;
  restored.tasks[0].priority = "normal";
  await store.save(restored, saved.revision);
  assert.equal((await store.load()).state.tasks[0].dueDate, null);
  for (const invalid of [{ dueDate: "2026-02-30" }, { dueDate: "" }, { dueDate: 123 }, { priority: "high" }, { priority: null }]) {
    const bad = structuredClone(restored);
    Object.assign(bad.tasks[0], invalid);
    assert.throws(() => validateState(bad));
  }
});

test("完成状态保存恢复，旧任务默认未完成并拒绝无效标记", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const state = fixture();
  const initial = validateState(state);
  assert.equal(initial.tasks[0].completed, false);
  assert.equal(initial.tasks[0].completedAt, 0);
  state.tasks[0] = { ...state.tasks[0], completed: true, completedAt: 5000 };
  const saved = await store.save(state, 0);
  const restored = (await store.load()).state;
  assert.equal(restored.tasks[0].completed, true);
  assert.equal(restored.tasks[0].completedAt, 5000);
  assert.equal(restored.tasks[0].groupId, null);
  assert.equal(restored.tasks[1].completed, false);
  assert.equal(restored.tasks[1].completedAt, 0);
  const file = JSON.parse(await readFile(path.join(directory, "task-root.todo.json"), "utf8"));
  assert.equal(file.task.completed, true);
  assert.equal(file.task.completedAt, 5000);
  restored.tasks[0].completed = false;
  restored.tasks[0].completedAt = 0;
  await store.save(restored, saved.revision);
  assert.equal((await store.load()).state.tasks[0].completed, false);
  for (const invalid of [{ completed: "true" }, { completed: 1 }, { completedAt: -1 }, { completedAt: "5000" }, { completedAt: null }]) {
    const bad = structuredClone(restored);
    Object.assign(bad.tasks[0], invalid);
    assert.throws(() => validateState(bad), /完成/);
  }
  const legacy = structuredClone(restored);
  legacy.tasks[0].completed = true;
  delete legacy.tasks[0].completedAt;
  assert.equal(validateState(legacy).tasks[0].completedAt, 0);
});

test("艾宾浩斯复习打卡保存恢复，取消完成时重置并拒绝无效状态", async () => {
  const directory = await sandbox();
  const store = createStore(directory);
  const state = fixture();
  assert.deepEqual(validateState(state).tasks[0].reviews, [0, 0, 0, 0]);
  state.tasks[0] = { ...state.tasks[0], completed: true, completedAt: 5000, reviews: [6000, 0, 7000, 0] };
  const saved = await store.save(state, 0);
  const restored = (await store.load()).state;
  assert.equal(restored.tasks[0].completed, true);
  assert.deepEqual(restored.tasks[0].reviews, [6000, 0, 7000, 0]);
  const file = JSON.parse(await readFile(path.join(directory, "task-root.todo.json"), "utf8"));
  assert.deepEqual(file.task.reviews, [6000, 0, 7000, 0]);
  restored.tasks[0].completed = false;
  restored.tasks[0].completedAt = 0;
  await store.save(restored, saved.revision);
  assert.deepEqual((await store.load()).state.tasks[0].reviews, [0, 0, 0, 0]);
  const legacy = structuredClone(restored);
  legacy.tasks[0].completed = true;
  legacy.tasks[0].completedAt = 5000;
  delete legacy.tasks[0].reviews;
  assert.deepEqual(validateState(legacy).tasks[0].reviews, [0, 0, 0, 0]);
  for (const invalid of [[6000], [6000, 0, 0, -1], [6000, 0, 0, "7000"], "6000", null]) {
    const bad = structuredClone(state);
    bad.tasks[0].reviews = invalid;
    assert.throws(() => validateState(bad), /复习/);
  }
});

test("本地 HTTP API 保存与恢复，验证来源和凭证，拒绝并发覆盖", async () => {
  const server = createTodoServer({ dataDirectory: await sandbox() });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const data = await (await fetch(`${base}/api/workspace`)).json();
    const options = { method: "PUT", headers: { "Content-Type": "application/json", "X-Todo-Token": data.token }, body: JSON.stringify({ state: fixture(), revision: data.revision }) };
    assert.equal((await fetch(`${base}/api/workspace`, { ...options, headers: { "Content-Type": "application/json" } })).status, 403);
    assert.equal((await fetch(`${base}/api/workspace`, { ...options, headers: { ...options.headers, Origin: "https://example.com" } })).status, 403);
    const responses = await Promise.all([fetch(`${base}/api/workspace`, options), fetch(`${base}/api/workspace`, options)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal((await (await fetch(`${base}/api/workspace`)).json()).state.tasks.length, 2);
    assert.equal((await fetch(`${base}/workspace-store.mjs`)).status, 404);
    assert.equal((await fetch(base)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("每日任务与当天完成状态保存恢复，兼容旧数据并拒绝无效输入", async () => {
  const store = createStore(await sandbox());
  const state = fixture();
  assert.deepEqual(validateState(state).dailyTasks, []);
  state.dailyTasks = [{ id: "daily-read", title: "阅读 20 分钟", completedOn: "2026-11-10" }, { id: "daily-walk", title: "散步", completedOn: null }];
  const saved = await store.save(state, 0);
  assert.deepEqual((await store.load()).state.dailyTasks, state.dailyTasks);
  state.dailyTasks[1].title = "散步 30 分钟";
  state.dailyTasks[0].completedOn = null;
  await store.save(state, saved.revision);
  assert.deepEqual((await store.load()).state.dailyTasks, state.dailyTasks);
  for (const invalid of [null, {}, [{ id: "bad/path", title: "任务" }], [{ id: "id", title: " " }], [{ id: "id", title: "a".repeat(201) }], [{ id: "id", title: "任务", completedOn: "2026-02-30" }], [{ id: "same", title: "一" }, { id: "same", title: "二" }], Array.from({ length: 501 }, (_, i) => ({ id: `daily-${i}`, title: "任务" }))]) {
    assert.throws(() => validateState({ ...fixture(), dailyTasks: invalid }));
  }
});
