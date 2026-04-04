<script setup lang="ts">
import MarkdownIt from "markdown-it";
import Shiki from "@shikijs/markdown-it";
import { transformerNotationHighlight, transformerNotationDiff } from "@shikijs/transformers";

const props = defineProps<{
  content: string;
}>();

const renderedHtml = ref("");

// 创建 markdown-it 实例
const md = MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
});

// 初始化 Shiki
onMounted(async () => {
  try {
    md.use(await Shiki({
      themes: {
        light: 'vitesse-light',
        dark: 'vitesse-dark',
      },
      transformers: [
        transformerNotationHighlight(),
        transformerNotationDiff(),
      ],
    }));

    renderMarkdown();
  } catch (error) {
    console.error("Shiki初始化错误:", error);
  }
});

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
async function renderMarkdown() {
  if (!props.content) {
    renderedHtml.value = "";
    return;
  }

  try {
    renderedHtml.value = md.render(props.content);

    // 渲染后添加复制按钮
    await nextTick();
    addCopyButtons();
  } catch (error) {
    console.error("Markdown渲染错误:", error);
    renderedHtml.value = `<p class="text-red-500">Markdown渲染错误</p>`;
  }
}

// 添加复制按钮
function addCopyButtons() {
  const preBlocks = document.querySelectorAll(".markdown-body pre.shiki");
  preBlocks.forEach((pre) => {
    // 如果已经有复制按钮，跳过
    if (pre.querySelector(".copy-button")) return;

    const button = document.createElement("button");
    button.className = "copy-button";
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    button.ariaLabel = "复制代码";

    button.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      if (!code) return;

      const text = code.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        button.classList.add("copied");
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          button.classList.remove("copied");
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        }, 2000);
      } catch (err) {
        console.error("复制失败:", err);
      }
    });

    pre.appendChild(button);
  });
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

/* Shiki 代码块容器样式 */
.markdown-body pre.shiki {
  margin: 1em 0;
  padding: 16px;
  overflow: auto;
  font-size: 0.875em;
  line-height: 1.7;
  border-radius: 8px;
  position: relative;
}

/* 行号样式 - 使用 CSS 计数器 */
.markdown-body pre.shiki {
  counter-reset: line;
  padding-left: 4em;
}

.markdown-body pre.shiki .line {
  display: block;
  counter-increment: line;
}

.markdown-body pre.shiki .line::before {
  content: counter(line);
  display: inline-block;
  width: 3em;
  padding-right: 1em;
  margin-left: -3.5em;
  text-align: right;
  color: rgb(156 163 175);
  opacity: 0.5;
  user-select: none;
}

.dark .markdown-body pre.shiki .line::before {
  color: rgb(107 114 128);
}

/* 高亮行样式 */
.markdown-body pre.shiki .line.highlighted {
  background: rgb(253 224 71 / 0.2);
}

.dark .markdown-body pre.shiki .line.highlighted {
  background: rgb(250 204 21 / 0.15);
}

/* Diff 样式 */
.markdown-body pre.shiki .line.diff.add {
  background: rgb(34 197 94 / 0.15);
}

.markdown-body pre.shiki .line.diff.remove {
  background: rgb(239 68 68 / 0.15);
}

/* 复制按钮样式 */
.markdown-body .copy-button {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: rgb(243 244 246);
  color: rgb(75 85 99);
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.875em;
  transition: all 0.2s;
  opacity: 0;
}

.markdown-body pre.shiki:hover .copy-button {
  opacity: 1;
}

.markdown-body .copy-button:hover {
  background: rgb(229 231 235);
}

.dark .markdown-body .copy-button {
  background: rgb(55 65 81);
  color: rgb(209 213 219);
}

.dark .markdown-body .copy-button:hover {
  background: rgb(75 85 99);
}

.markdown-body .copy-button.copied {
  background: rgb(34 197 94);
  color: white;
}

.dark .markdown-body .copy-button.copied {
  background: rgb(22 163 74);
}

.markdown-body .copy-button svg {
  width: 16px;
  height: 16px;
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
