<script setup lang="ts">
import MarkdownIt from "markdown-it";
import highlightAll from "~/plugins/prism-v2/prism.js";

const props = defineProps<{
  content: string;
}>();

const renderedHtml = ref("");

// 创建 markdown-it 实例
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

// 自定义代码块渲染，添加 language-xxx 类
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";

  // 提取语言名称
  let lang = "";
  if (info) {
    // 获取第一个单词作为语言
    lang = info.split(/\s+/g)[0];
  }

  // 获取代码内容
  let content = token.content;

  // 转义 HTML
  content = content.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

  // 构建 pre code 结构，prism 需要 <pre><code class="language-xxx">
  const className = lang ? `language-${lang}` : "";
  return `<pre class="line-numbers"><code class="${className}">${content}</code></pre>`;
};

// 自定义链接渲染规则（新窗口打开）
md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any) => {
  const aIndex = tokens[idx].attrIndex("target");
  if (aIndex < 0) {
    tokens[idx].attrPush(["target", "_blank"]);
  } else {
    tokens[idx].attrs[aIndex][1] = "_blank";
  }
  const relIndex = tokens[idx].attrIndex("rel");
  if (relIndex < 0) {
    tokens[idx].attrPush(["rel", "noopener noreferrer"]);
  }
  return self.renderToken(tokens, idx, options);
};

// 自定义图片渲染规则（懒加载）
md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
  const token = tokens[idx];
  token.attrSet("loading", "lazy");
  token.attrSet("class", "markdown-image");
  return self.renderToken(tokens, idx, options);
};

// 渲染 Markdown 内容
function renderMarkdown() {
  if (!props.content) {
    renderedHtml.value = "";
    return;
  }

  try {
    renderedHtml.value = md.render(props.content);

    // 渲染后调用 prism 高亮
    nextTick(() => {
      highlightAll(
        (el: Element, type: string, handler: any, options: any) => {
          el.addEventListener(type, handler, options);
        },
        () => {
          // forEach 回调，在高亮前执行
        }
      );
    });
  } catch (error) {
    console.error("Markdown渲染错误:", error);
    renderedHtml.value = `<p class="text-red-500">Markdown渲染错误</p>`;
  }
}

// 监听内容变化
watch(
  () => props.content,
  () => {
    renderMarkdown();
  },
  { immediate: true },
);
</script>

<template>
  <div class="markdown-body" v-html="renderedHtml"></div>
</template>

<style>
.markdown-body {
  line-height: 1.8;
  color: rgb(31 41 55);
  word-wrap: break-word;
}

.dark .markdown-body {
  color: rgb(229 231 235);
}

/* 标题样式 */
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 700;
  line-height: 1.3;
}

.markdown-body h1 {
  font-size: 2em;
  border-bottom: 1px solid rgb(229 231 235);
  padding-bottom: 0.3em;
}

.dark .markdown-body h1 {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body h2 {
  font-size: 1.5em;
  border-bottom: 1px solid rgb(229 231 235);
  padding-bottom: 0.3em;
}

.dark .markdown-body h2 {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body h3 {
  font-size: 1.25em;
}

.markdown-body h4 {
  font-size: 1em;
}

/* 段落样式 */
.markdown-body p {
  margin: 1em 0;
}

/* 链接样式 */
.markdown-body a {
  color: rgb(37 99 235);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.dark .markdown-body a {
  color: rgb(96 165 250);
}

/* 列表样式 */
.markdown-body ul,
.markdown-body ol {
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-body ul {
  list-style-type: disc;
}

.markdown-body ol {
  list-style-type: decimal;
}

.markdown-body ul ul {
  list-style-type: circle;
}

.markdown-body ul ul ul {
  list-style-type: square;
}

.markdown-body li {
  margin: 0.5em 0;
  display: list-item;
}

/* 引用样式 */
.markdown-body blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}

.dark .markdown-body blockquote {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

/* 行内代码样式 */
.markdown-body code:not(pre code) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dark .markdown-body code:not(pre code) {
  background: rgb(55 65 81);
}

/* 代码块样式 - prism 容器 */
.markdown-body pre {
  margin: 1em 0;
  padding: 0;
  overflow: auto;
  font-size: 0.875em;
  line-height: 1.5;
  background: transparent;
  border-radius: 8px;
}

.markdown-body pre code {
  padding: 16px;
  background: rgb(30 30 30);
  color: rgb(229 231 235);
  border-radius: 8px;
  display: block;
  overflow-x: auto;
}

.dark .markdown-body pre code {
  background: rgb(15 15 15);
}

/* Prism 工具栏样式 */
.markdown-body .code-toolbar {
  position: relative;
  margin: 1em 0;
  border-radius: 8px;
  overflow: hidden;
}

.markdown-body .code-toolbar pre {
  margin: 0;
}

.markdown-body .toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px;
  background: rgb(40 40 40);
  border-bottom: 1px solid rgb(51 51 51);
  font-size: 0.875em;
}

.markdown-body .toolbar-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.markdown-body .copy-to-clipboard-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: rgb(156 163 175);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.875em;
  transition: all 0.2s;
}

.markdown-body .copy-to-clipboard-button:hover {
  background: rgb(51 51 51);
  color: rgb(255 255 255);
}

.markdown-body .copy-to-clipboard-button[data-copy-state="copy-success"] {
  color: rgb(34 197 94);
}

.markdown-body .prism-icon {
  width: 16px;
  height: 16px;
}

.markdown-body .prism-language {
  color: rgb(156 163 175);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  text-transform: lowercase;
}

/* Prism 行号样式 */
.markdown-body .line-numbers-rows {
  position: absolute;
  pointer-events: none;
  top: 0;
  left: -3.8em;
  width: 3em;
  letter-spacing: -1px;
  border-right: 1px solid rgb(51 51 51);
  user-select: none;
  padding-right: 8px;
  padding-top: 16px;
}

.markdown-body .line-numbers-rows > span {
  counter-increment: linenumber;
}

.markdown-body .line-numbers-rows > span:before {
  content: counter(linenumber);
  color: rgb(107 114 128);
  display: block;
  text-align: right;
}

.markdown-body .line-numbers .line-numbers-rows {
  border-right: 1px solid rgb(75 85 99);
}

.dark .markdown-body .line-numbers-rows > span:before {
  color: rgb(75 85 99);
}

/* 图片样式 */
.markdown-body .markdown-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1em 0;
}

/* 表格样式 */
.markdown-body table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
}

.markdown-body table th,
.markdown-body table td {
  padding: 0.5em 1em;
  border: 1px solid rgb(229 231 235);
}

.dark .markdown-body table th,
.dark .markdown-body table td {
  border-color: rgb(55 65 81);
}

.markdown-body table th {
  background: rgb(249 250 251);
  font-weight: 600;
}

.dark .markdown-body table th {
  background: rgb(31 41 55);
}

/* 分割线样式 */
.markdown-body hr {
  margin: 2em 0;
  border: none;
  border-top: 1px solid rgb(229 231 235);
}

.dark .markdown-body hr {
  border-top-color: rgb(55 65 81);
}
</style>
