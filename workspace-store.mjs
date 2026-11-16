import { mkdir, readFile, writeFile, rename, unlink, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import taskRules from "./task-rules.js";

const FORMAT = "yijian.workspace.v2";
const MANIFEST = ".todo-workspace.json";
const ID = /^[a-zA-Z0-9-]{1,100}$/;
const validTime = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
export function validateState(raw) {
  if (!raw || raw.version !== 2 || !validTime(raw.modifiedAt) || !Array.isArray(raw.groups) || !Array.isArray(raw.tasks) || raw.groups.length > 500 || raw.tasks.length > 10000) throw new Error("待办数据格式不正确或超出保存数量限制");
  const groupIds = new Set();
  const groupNames = new Set();
  const groups = raw.groups.map(group => {
    if (!group || typeof group.id !== "string" || !ID.test(group.id) || groupIds.has(group.id) || typeof group.name !== "string" || group.name.length < 1 || group.name.length > 60 || group.name !== group.name.trim() || /[<>:"/\\|?*\u0000-\u001f]/.test(group.name) || /[. ]$/.test(group.name) || /^\./.test(group.name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(group.name) || ["全部待办", "未分组"].includes(group.name) || groupNames.has(group.name.toLowerCase())) throw new Error("分组名称或标识无效，无法创建文件夹");
    groupIds.add(group.id);
    groupNames.add(group.name.toLowerCase());
    return { id: group.id, name: group.name };
  });
  const taskIds = new Set();
  const tasks = raw.tasks.map(task => {
    if (!task || typeof task.id !== "string" || !ID.test(task.id) || taskIds.has(task.id) || typeof task.title !== "string" || (task.content === undefined ? (!task.title.trim() || task.title.length > 200) : (typeof task.content !== "string" || task.content.length > 5000 || task.title.length > 120 || !(task.title.trim() || task.content.trim()))) || (task.collapsed !== undefined && typeof task.collapsed !== "boolean") || !validTime(task.createdAt) || !validTime(task.pinnedAt) || (task.groupId !== null && !groupIds.has(task.groupId))) throw new Error("待办内容或分组关联无效");
    taskIds.add(task.id);
    if (task.dueDate !== undefined && task.dueDate !== null && !taskRules.validDueDate(task.dueDate)) throw new Error("截止日期无效");
    if (task.priority !== undefined && !["normal", "urgent"].includes(task.priority)) throw new Error("优先级无效");
    for (const field of ["homework", "longTerm"]) if (task[field] !== undefined && typeof task[field] !== "boolean") throw new Error("特殊分组标记无效");
    if (task.completed !== undefined && typeof task.completed !== "boolean") throw new Error("完成状态无效");
    if (task.completedAt !== undefined && !validTime(task.completedAt)) throw new Error("完成时间无效");
    if (task.reviews !== undefined && (!Array.isArray(task.reviews) || task.reviews.length !== 4 || task.reviews.some(value => !validTime(value)))) throw new Error("复习打卡状态无效");
    const completed = task.completed === true;
    const reviews = completed && Array.isArray(task.reviews) ? task.reviews.slice() : [0, 0, 0, 0];
    return { id: task.id, title: task.content === undefined ? "" : task.title.trim(), content: task.content === undefined ? task.title.trim() : task.content.trim(), collapsed: task.collapsed === true, dueDate: task.dueDate ?? null, priority: task.priority ?? "normal", homework: task.homework === true, longTerm: task.longTerm === true, completed, completedAt: completed ? (task.completedAt ?? 0) : 0, reviews, createdAt: task.createdAt, pinnedAt: task.pinnedAt, groupId: task.groupId };
  });
  if (raw.dailyTasks !== undefined && (!Array.isArray(raw.dailyTasks) || raw.dailyTasks.length > 500)) throw new Error("每日任务列表无效或数量超过 500 项");
  const dailyIds = new Set();
  const dailyTasks = (raw.dailyTasks || []).map(task => {
    if (!task || typeof task.id !== "string" || !ID.test(task.id) || dailyIds.has(task.id) || typeof task.title !== "string" || !task.title.trim() || task.title.length > 200 || (task.completedOn !== undefined && task.completedOn !== null && !taskRules.validDueDate(task.completedOn))) throw new Error("每日任务内容或完成日期无效");
    dailyIds.add(task.id);
    return { id: task.id, title: task.title.trim(), completedOn: task.completedOn ?? null };
  });
  return { version: 2, modifiedAt: raw.modifiedAt, groups, tasks, dailyTasks };
}

async function existsStat(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function atomicJson(filename, data) {
  const existing = await existsStat(filename);
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("保存位置存在非普通文件，请检查保存目录");
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, filename);
  } finally {
    try { await unlink(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

export function createStore(directory) {
  const root = path.resolve(directory);
  let canonicalRoot;
  async function verifyDirectory(groupName, create) {
    const folder = groupName ? path.join(root, groupName) : root;
    if (groupName && (path.dirname(folder) !== root || path.basename(folder) !== groupName)) throw new Error("分组路径超出保存目录");
    let stat = await existsStat(folder);
    if (!stat && create) { await mkdir(folder, { recursive: !groupName }); stat = await lstat(folder); }
    if (!stat) return false;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("保存目录不能是链接或普通文件");
    const resolved = await realpath(folder);
    if (!groupName) canonicalRoot = resolved;
    else if (path.dirname(resolved).toLowerCase() !== canonicalRoot.toLowerCase()) throw new Error("分组文件夹超出保存目录");
    return true;
  }
  async function load() {
    if (!await verifyDirectory(null, false)) return { state: null, revision: 0 };
    const filename = path.join(root, MANIFEST);
    const stat = await existsStat(filename);
    if (!stat) return { state: null, revision: 0 };
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error("本地保存索引无效，请先备份并检查 .todo-workspace.json");
    const saved = JSON.parse(await readFile(filename, "utf8"));
    if (saved.format !== FORMAT || !Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error("本地保存索引格式不正确");
    return { state: validateState(saved.state), revision: saved.revision };
  }
  function taskRelativePath(task, state) {
    const name = state.groups.find(group => group.id === task.groupId)?.name;
    return name ? path.join(name, `${task.id}.todo.json`) : `${task.id}.todo.json`;
  }
  async function save(raw, expectedRevision) {
    const state = validateState(raw);
    const previous = await load();
    if (expectedRevision !== previous.revision) {
      const error = new Error("本地数据已被另一个页面更新，请刷新页面后再保存");
      error.statusCode = 409;
      throw error;
    }
    await verifyDirectory(null, true);
    for (const group of state.groups) await verifyDirectory(group.name, true);
    const files = new Set();
    for (const task of state.tasks) {
      const relative = taskRelativePath(task, state);
      const filename = path.join(root, relative);
      const existing = await existsStat(filename);
      if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() || existing.size > 100000) throw new Error("待办文件位置被其他文件占用");
        const owned = JSON.parse(await readFile(filename, "utf8"));
        if (owned.format !== "yijian.task.v2" || owned.task?.id !== task.id) throw new Error("待办文件位置被其他文件占用");
      }
      await atomicJson(filename, { format: "yijian.task.v2", group: task.groupId ? state.groups.find(group => group.id === task.groupId).name : null, task });
      files.add(relative);
    }
    const revision = Math.max(Date.now(), previous.revision + 1);
    // Commit the complete snapshot last. A failed task write leaves the previous snapshot readable.
    await atomicJson(path.join(root, MANIFEST), { format: FORMAT, revision, state });
    const warnings = [];
    if (previous.state) for (const task of previous.state.tasks) {
      const relative = taskRelativePath(task, previous.state);
      if (files.has(relative)) continue;
      try {
        const group = previous.state.groups.find(item => item.id === task.groupId);
        if (group && !await verifyDirectory(group.name, false)) continue;
        const filename = path.join(root, relative);
        const stat = await existsStat(filename);
        if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > 100000) continue;
        const owned = JSON.parse(await readFile(filename, "utf8"));
        if (owned.format === "yijian.task.v2" && owned.task?.id === task.id) await unlink(filename);
      } catch { warnings.push("部分旧待办文件未能清理，当前保存与恢复不受影响"); }
    }
    return { revision, path: root, warnings: [...new Set(warnings)] };
  }
  return { root, load, save };
}
