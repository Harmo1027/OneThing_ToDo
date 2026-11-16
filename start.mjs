import { spawn } from "node:child_process";

function openBrowser(url) {
  if (process.argv.includes("--no-open")) return;
  const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", "start", "", url], { windowsHide: true, stdio: "ignore" });
  child.on("error", () => console.log(`请手动在浏览器打开：${url}`));
  child.unref();
}

try {
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("需要 Node.js 20 或更高版本，请更新 Node.js 后重试。");
  const port = Number(process.env.TODO_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("TODO_PORT 必须是 1–65535 之间的端口号。");
  const url = `http://127.0.0.1:${port}`;
  let running = false;
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    running = response.ok && (await response.json()).app === "yijian-todo";
  } catch { /* No compatible service is currently running. */ }
  if (running) {
    console.log(`待办已在运行，打开现有页面：${url}`);
    openBrowser(url);
  } else {
    const { createTodoServer, defaultDataDirectory } = await import("./server.mjs");
    const directory = defaultDataDirectory();
    const server = createTodoServer({ dataDirectory: directory });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    console.log(`一件 · 我的待办：${url}`);
    console.log(`本地保存目录：${directory}`);
    console.log(process.argv.includes("--no-open") ? "使用期间请保持此窗口打开，按 Ctrl+C 停止服务。" : "已打开浏览器。使用期间请保持此窗口打开，按 Ctrl+C 停止服务。");
    openBrowser(url);
  }
} catch (error) {
  console.error(error.code === "EADDRINUSE" ? "端口已被其他程序占用。请关闭旧的待办服务或占用 4173 的程序后重试。" : `启动失败：${error.message}`);
  process.exitCode = 1;
}
