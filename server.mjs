import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createStore } from "./workspace-store.mjs";
import taskRules from "./task-rules.js";

const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/task-rules.js", ["task-rules.js", "text/javascript; charset=utf-8"]],
  ["/markdown.js", ["markdown.js", "text/javascript; charset=utf-8"]]
]);

export function defaultDataDirectory() {
  if (process.env.TODO_DATA_DIR) return path.resolve(process.env.TODO_DATA_DIR);
  let documents = path.join(os.homedir(), "Documents");
  if (process.platform === "win32") {
    try {
      documents = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')"], { encoding: "utf8", windowsHide: true, timeout: 5000 }).trim() || documents;
    } catch { /* Standard Documents location remains available as a fallback. */ }
  }
  return path.join(documents, "Todo");
}

export function createTodoServer({ dataDirectory = defaultDataDirectory() } = {}) {
  const store = createStore(dataDirectory);
  const token = randomBytes(32).toString("hex");
  const attachmentPath = /^\/api\/attachments\/([a-zA-Z0-9-]{1,100})\/([a-zA-Z0-9-]{1,100})\.([a-z0-9]{2,10})$/;
  const tokenMatches = value => {
    const supplied = Buffer.from(String(value || ""));
    const expected = Buffer.from(token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  let writes = Promise.resolve();
  const sendJson = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== expectedHost && req.headers.host !== `localhost:${server.address().port}`) { sendJson(res, 403, { error: "仅限本机访问" }); return; }
    const url = new URL(req.url, `http://${expectedHost}`);
    if (url.pathname === "/api/health" && req.method === "GET") { sendJson(res, 200, { app: "yijian-todo" }); return; }
    if (url.pathname === "/api/workspace") {
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}`) || req.headers["sec-fetch-site"] === "cross-site") { sendJson(res, 403, { error: "来源不允许" }); return; }
      try {
        if (req.method === "GET") {
          await writes;
          const saved = await store.load();
          sendJson(res, 200, { ...saved, path: store.root, token });
        } else if (req.method === "PUT") {
          const supplied = Buffer.from(String(req.headers["x-todo-token"] || ""));
          const expected = Buffer.from(token);
          if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { sendJson(res, 403, { error: "保存凭证已过期，请刷新页面" }); return; }
          if (!String(req.headers["content-type"]).startsWith("application/json")) { sendJson(res, 415, { error: "需要 JSON 数据" }); return; }
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 8 * 1024 * 1024) { sendJson(res, 413, { error: "保存数据过大" }); return; }
            chunks.push(chunk);
          }
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { sendJson(res, 400, { error: "保存数据不是有效 JSON" }); return; }
          if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) { sendJson(res, 400, { error: "保存版本无效" }); return; }
          const operation = writes.then(() => store.save(body.state, body.revision));
          writes = operation.catch(() => {});
          sendJson(res, 200, await operation);
        } else { res.setHeader("Allow", "GET, PUT"); sendJson(res, 405, { error: "不支持的操作" }); }
      } catch (error) {
        const status = error.statusCode || (error.code === "EACCES" || error.code === "EPERM" ? 403 : 400);
        sendJson(res, status, { error: error.code === "EACCES" || error.code === "EPERM" ? "没有保存目录的写入权限，请检查文件夹权限" : error.message });
      }
      return;
    }
    if (url.pathname === "/api/attachments") {
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); sendJson(res, 405, { error: "不支持的操作" }); return; }
      const origin = req.headers.origin;
      if ((origin && origin !== `http://${req.headers.host}`) || req.headers["sec-fetch-site"] === "cross-site") { sendJson(res, 403, { error: "来源不允许" }); return; }
      if (!tokenMatches(req.headers["x-todo-token"])) { sendJson(res, 403, { error: "保存凭证已过期，请刷新页面" }); return; }
      const taskId = String(req.headers["x-task-id"] || "");
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(taskId)) { sendJson(res, 400, { error: "附件关联的待办无效" }); return; }
      let fileName = "";
      try { fileName = decodeURIComponent(String(req.headers["x-file-name"] || "")); } catch { /* Invalid filename header is handled below. */ }
      const ext = taskRules.attachmentExtension(fileName);
      if (!ext || !taskRules.validAttachmentName(fileName)) { sendJson(res, 400, { error: "仅支持 DOCX、PDF、PPT / PPTX 及常用图片（PNG、JPG、GIF、WebP 等），且文件名需有效" }); return; }
      const declaredLength = Number(req.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > taskRules.MAX_ATTACHMENT_BYTES) { sendJson(res, 413, { error: "单个附件不能超过 20MB" }); return; }
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > taskRules.MAX_ATTACHMENT_BYTES) { sendJson(res, 413, { error: "单个附件不能超过 20MB" }); return; }
          chunks.push(chunk);
        }
        if (!size) { sendJson(res, 400, { error: "附件内容为空" }); return; }
        const attachmentId = randomUUID();
        await store.saveAttachment(taskId, attachmentId, ext, Buffer.concat(chunks));
        sendJson(res, 200, { attachment: { id: attachmentId, name: fileName, size, ext } });
      } catch (error) {
        const status = error.code === "EACCES" || error.code === "EPERM" ? 403 : 400;
        sendJson(res, status, { error: status === 403 ? "没有附件目录的写入权限，请检查文件夹权限" : error.message });
      }
      return;
    }
    const attachmentMatch = url.pathname.match(attachmentPath);
    if (attachmentMatch) {
      if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); sendJson(res, 405, { error: "不支持的操作" }); return; }
      if (!tokenMatches(req.headers["x-todo-token"] || url.searchParams.get("token"))) { sendJson(res, 403, { error: "保存凭证已过期，请刷新页面" }); return; }
      const [, taskId, attachmentId, ext] = attachmentMatch;
      if (!taskRules.ATTACHMENT_TYPES[ext]) { sendJson(res, 400, { error: "附件格式无效" }); return; }
      try {
        const data = await store.readAttachment(taskId, attachmentId, ext);
        if (!data) { sendJson(res, 404, { error: "附件文件不存在，请确认本地保存目录中的 .attachments 文件夹" }); return; }
        const type = taskRules.ATTACHMENT_TYPES[ext];
        res.writeHead(200, {
          "Content-Type": type.mime,
          "Content-Length": data.length,
          "Content-Disposition": `${type.image ? "inline" : "attachment"}; filename="${attachmentId}.${ext}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        res.end(req.method === "HEAD" ? undefined : data);
      } catch (error) { sendJson(res, error.code === "EACCES" || error.code === "EPERM" ? 403 : 400, { error: error.code === "EACCES" || error.code === "EPERM" ? "没有附件目录的读取权限，请检查文件夹权限" : error.message }); }
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return; }
    const route = routes.get(url.pathname);
    if (!route) { res.writeHead(404); res.end("Not found"); return; }
    try {
      const content = await readFile(new URL(route[0], import.meta.url));
      res.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch { res.writeHead(500); res.end("Could not read file"); }
  });
  server.requestTimeout = 30000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDirectory = defaultDataDirectory();
  const server = createTodoServer({ dataDirectory });
  const port = Number(process.env.TODO_PORT || 4173);
  server.on("error", error => { console.error(`无法启动本地服务：${error.message}`); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => {
    console.log(`一件 · 我的待办：http://127.0.0.1:${server.address().port}`);
    console.log(`默认本地保存目录：${dataDirectory}`);
  });
}
