// 安全的基础 Markdown 渲染：不执行原始 HTML，仅生成受控标签。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TodoMarkdown = factory();
})(globalThis, function () {
  "use strict";
  const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
  const safeUrl = value => {
    const url = String(value || "").trim();
    return /^(https?:\/\/|mailto:)/i.test(url) && !/[\s<>"]/.test(url) ? url : "";
  };
  const emphasis = text => text
    .replace(/\*\*\*(?=\S)([^*\n]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)([^_\n]*?\S)__/g, "<strong>$1</strong>")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "<del>$1</del>")
    .replace(/(?<![*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, "<em>$1</em>")
    .replace(/(?<![_\w])_(?=\S)([^_\n]*?\S)_(?![_\w])/g, "<em>$1</em>");
  function inline(raw) {
    const source = String(raw ?? "");
    const segments = [];
    let buffer = "";
    const flush = () => {
      if (buffer) {
        segments.push({ type: "text", value: buffer });
        buffer = "";
      }
    };
    let index = 0;
    while (index < source.length) {
      if (source[index] === "`") {
        const end = source.indexOf("`", index + 1);
        if (end !== -1) {
          flush();
          segments.push({ type: "html", value: `<code>${escapeHtml(source.slice(index + 1, end))}</code>` });
          index = end + 1;
          continue;
        }
      }
      const image = source[index] === "!" && source[index + 1] === "[";
      if (source[index] === "[" || image) {
        const labelStart = index + (image ? 2 : 1);
        const labelEnd = source.indexOf("]", labelStart);
        if (labelEnd !== -1 && source[labelEnd + 1] === "(") {
          const targetEnd = source.indexOf(")", labelEnd + 2);
          if (targetEnd !== -1) {
            const label = source.slice(labelStart, labelEnd);
            const url = safeUrl(source.slice(labelEnd + 2, targetEnd));
            flush();
            if (url) {
              const labelHtml = emphasis(escapeHtml(label));
              segments.push({ type: "html", value: `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${labelHtml}${image ? "（图片）" : ""}</a>` });
            } else {
              segments.push({ type: "html", value: escapeHtml(source.slice(index, targetEnd + 1)) });
            }
            index = targetEnd + 1;
            continue;
          }
        }
      }
      buffer += source[index];
      index++;
    }
    flush();
    return segments.map(segment => segment.type === "html" ? segment.value : emphasis(escapeHtml(segment.value))).join("");
  }
  function hasMarkdown(value) {
    const text = String(value ?? "");
    return /(^|\n)\s{0,3}(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```|---|\*\*\*|___)/.test(text)
      || /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|(?<![*\w])\*(?=\S)[^*\n]*?\S\*(?![*\w])|(?<![_\w])_(?=\S)[^_\n]*?\S_(?![_\w]))/.test(text);
  }
  function isBlockStart(line) {
    return /^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```|---|\*\*\*|___)/.test(line);
  }
  function render(raw) {
    const lines = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n");
    const output = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
      if (fence) {
        index++;
        const code = [];
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
        if (index < lines.length) index++;
        const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
        output.push(`<pre class="md-code-block"><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }
      const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        output.push(`<h${level} class="md-heading md-h${level}">${inline(heading[2])}</h${level}>`);
        index++;
        continue;
      }
      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        output.push("<hr>");
        index++;
        continue;
      }
      if (/^\s{0,3}>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s{0,3}>\s?/, ""));
        output.push(`<blockquote class="md-quote">${quote.map(item => inline(item)).join("<br>")}</blockquote>`);
        continue;
      }
      const unordered = /^\s{0,3}[-*+]\s+(.+)$/.exec(line);
      const ordered = /^\s{0,3}\d+[.)]\s+(.+)$/.exec(line);
      if (unordered || ordered) {
        const items = [];
        while (index < lines.length) {
          const match = ordered ? /^\s{0,3}\d+[.)]\s+(.+)$/.exec(lines[index]) : /^\s{0,3}[-*+]\s+(.+)$/.exec(lines[index]);
          if (!match) break;
          let item = match[1];
          let taskBox = "";
          const task = /^\[([ xX])\]\s+(.*)$/.exec(item);
          if (task) {
            taskBox = `<span class="md-task-box${task[1].toLowerCase() === "x" ? " is-done" : ""}" aria-hidden="true"></span>`;
            item = task[2];
          }
          items.push(`<li${taskBox ? ' class="md-task-item"' : ""}>${taskBox}${taskBox ? "<span>" : ""}${inline(item)}${taskBox ? "</span>" : ""}</li>`);
          index++;
        }
        const tag = ordered ? "ol" : "ul";
        output.push(`<${tag} class="md-list">${items.join("")}</${tag}>`);
        continue;
      }
      const paragraph = [line];
      index++;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
      output.push(`<p>${paragraph.map(item => inline(item)).join("<br>")}</p>`);
    }
    return output.join("");
  }
  return { hasMarkdown, renderInline: inline, render };
});