import { test } from "node:test";
import assert from "node:assert/strict";
import markdown from "./markdown.js";

test("Markdown 检测与基础行内语法", () => {
  assert.equal(markdown.hasMarkdown("普通正文\n第二行"), false);
  assert.equal(markdown.hasMarkdown("## 标题"), true);
  assert.equal(markdown.hasMarkdown("这是 **加粗** 和 `代码`"), true);
  assert.equal(markdown.hasMarkdown("*只有斜体*"), true);
  assert.equal(markdown.hasMarkdown("_只有斜体_"), true);
  assert.equal(markdown.hasMarkdown("2 * 3 * 4"), false);
  assert.match(markdown.renderInline("*只有斜体*"), /<em>只有斜体<\/em>/);
  assert.doesNotMatch(markdown.renderInline("2 * 3 * 4"), /<em>/);
  const inline = markdown.renderInline("**加粗** *斜体* ~~删除~~ `a < b`");
  assert.match(inline, /<strong>加粗<\/strong>/);
  assert.match(inline, /<em>斜体<\/em>/);
  assert.match(inline, /<del>删除<\/del>/);
  assert.match(inline, /<code>a &lt; b<\/code>/);
  assert.match(markdown.renderInline("__项目__"), /<strong>项目<\/strong>/);
});

test("Markdown 链接只允许安全协议且不会输出原始 HTML", () => {
  const safe = markdown.renderInline("[站点](https://example.com/?a=1&b=2)");
  assert.match(safe, /<a href="https:\/\/example\.com\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">站点<\/a>/);
  const unsafe = markdown.renderInline("[危险](javascript:alert(1))");
  assert.doesNotMatch(unsafe, /<a /);
  assert.match(unsafe, /javascript:alert\(1\)/);
  const html = markdown.renderInline('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;img/);
  const imageSyntax = markdown.renderInline("![图](https://example.com/a.png)");
  assert.doesNotMatch(imageSyntax, /<img/i);
  assert.match(imageSyntax, /<a /);
});

test("Markdown 块级语法、任务列表与代码块", () => {
  const source = [
    "## 计划",
    "",
    "- 第一项",
    "- [x] 已完成",
    "- [ ] 未完成",
    "",
    "> 引用内容",
    "",
    "1. 有序一",
    "2. 有序二",
    "",
    "```js",
    "const x = '<tag>';",
    "```",
    "",
    "---"
  ].join("\n");
  const html = markdown.render(source);
  assert.match(html, /<h2 class="md-heading md-h2">计划<\/h2>/);
  assert.match(html, /<ul class="md-list">/);
  assert.match(html, /<li class="md-task-item">/);
  assert.match(html, /md-task-box is-done/);
  assert.match(html, /<ol class="md-list">/);
  assert.match(html, /<blockquote class="md-quote">引用内容<\/blockquote>/);
  assert.match(html, /<pre class="md-code-block"><code class="language-js">const x = &#39;&lt;tag&gt;&#39;;<\/code><\/pre>/);
  assert.match(html, /<hr>/);
  assert.doesNotMatch(html, /<script/i);
});