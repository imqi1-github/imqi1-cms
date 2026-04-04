<script setup lang="ts">
import MarkdownIt from "markdown-it";

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
.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dark .markdown-body code {
  background: rgb(55 65 81);
}

/* 代码块样式 */
.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 0.875em;
  line-height: 1.5;
  background: rgb(30 30 30);
  color: rgb(229 231 235);
  border-radius: 8px;
  margin: 1em 0;
}

.markdown-body pre code {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 100%;
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
