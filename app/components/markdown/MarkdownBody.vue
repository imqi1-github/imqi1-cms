<template>
  <div class="markdown-body article-body" v-html="html" />
</template>

<script setup lang="ts">
// 文章正文 / 独立页面正文的 markdown 渲染容器（服务端 renderMarkdown 产物）。
// 收敛 .markdown-body 排版、富容器占位、shiki 代码样式到一处，文章页与协议页共享。
defineProps<{ html: string }>();

// 动态注入 icons CDN URL（不走 CSS url()，避免 buildAssetsDir: "/" 时被 Vite 重写成带 hash 路径）。
// public/icons/ 是 public 静态资源，不带 hash，走 CDN 根。
const iconUrls: Record<string, string> = {
  github: publicAsset("/icons/github.svg"),
  gitee: publicAsset("/icons/gitee.svg"),
  baidu: publicAsset("/icons/baidu.svg"),
  google: publicAsset("/icons/google.svg"),
  tencent: publicAsset("/icons/tencent.svg"),
  wechat: publicAsset("/icons/wechat.svg"),
  mozilla: publicAsset("/icons/mozilla.svg"),
  npm: publicAsset("/icons/npm.svg"),
};

onMounted(() => {
  // 直接给每个 icon span 设 inline style.backgroundImage，彻底绕过 CSS rewrite 和 specificity 问题。
  const el = document.querySelector(".markdown-body");
  if (!el) return;
  for (const [slug, url] of Object.entries(iconUrls)) {
    el.querySelectorAll(`.markdown-link-icon--${slug}`).forEach(span => {
      (span as HTMLElement).style.maskImage = `url("${url}")`;
      (span as HTMLElement).style.webkitMaskImage = `url("${url}")`;
    });
  }
});
</script>

<style scoped>
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}

.markdown-body > * ~ * {
  margin-top: 1em;
}

/* 图片容器 */
.markdown-body :deep(.markdown-figure) {
  margin: 20px 0;
  text-align: center;
}

.markdown-body :deep(.markdown-figure img) {
  margin: auto;
}

/* 正文自定义组件 SSR 占位：避免客户端替换真实组件时从 0 高度突然撑开 */
.markdown-body :deep(.markdown-video-wrapper),
.markdown-body :deep(.markdown-video-container video) {
  aspect-ratio: 16 / 9;
  width: 100%;
  max-width: 100%;
  border-radius: 0.5rem;
  background: rgb(243 244 246);
}

.dark .markdown-body :deep(.markdown-video-wrapper),
.dark .markdown-body :deep(.markdown-video-container video) {
  background: rgb(31 41 55);
}

.markdown-body :deep(.markdown-repo-wrapper),
.markdown-body :deep(.markdown-card-wrapper) {
  display: block;
  min-height: 9rem;
}

.markdown-body :deep(.markdown-music-wrapper),
.markdown-body :deep(.markdown-simple-card-wrapper) {
  display: block;
  min-height: 6rem;
}

.markdown-body :deep(.markdown-swiper-wrapper) {
  display: block;
  min-height: 27rem;
}

.markdown-body :deep(.markdown-waterfall-wrapper),
.markdown-body :deep(.markdown-live-photo-wrapper) {
  display: block;
  min-height: min(60vh, 22rem);
  border-radius: 0.5rem;
  background: rgb(243 244 246);
}

.dark .markdown-body :deep(.markdown-waterfall-wrapper),
.dark .markdown-body :deep(.markdown-live-photo-wrapper) {
  background: rgb(31 41 55);
}

@media (max-width: 768px) {
  .markdown-body :deep(.markdown-swiper-wrapper) {
    min-height: 17.625rem;
  }

  .markdown-body :deep(.markdown-waterfall-wrapper),
  .markdown-body :deep(.markdown-live-photo-wrapper) {
    min-height: min(60vh, 18rem);
  }
}

/* 图片标题 */
.markdown-body :deep(.markdown-figcaption) {
  font-size: 0.875em;
  color: rgb(107 114 128);
  margin-top: 8px;
  line-height: 1.4;
}

.dark .markdown-body :deep(.markdown-figcaption) {
  color: rgb(156 163 175);
}

.markdown-body :deep(img:not(.swiper-container img):not(.markdown-card img):not(.markdown-simple-card img):not(.markdown-repo img)) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  cursor: zoom-in;
  margin: auto;
  transition: transform 0.3s ease;
}

/* 卡片类容器内的缩略图由模板尺寸类（size-full object-cover）控制，不套用通用图片规则 */
.markdown-body :deep(.markdown-card img),
.markdown-body :deep(.markdown-simple-card img),
.markdown-body :deep(.markdown-repo img) {
  height: 100%;
}

/* 大链接卡片左侧缩略图：hover 时平滑放大，过渡由 CSS 显式驱动，
   不依赖工具类（卡片 HTML 是 innerHTML 注入，group-hover/transition 工具类扫描不可靠） */
.markdown-body :deep(.markdown-card .markdown-card__thumb) {
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  will-change: transform;
}

.markdown-body :deep(.markdown-card a:hover) .markdown-card__thumb {
  transform: scale(1.06);
}

.markdown-body :deep(.markdown-image-container),
.markdown-body :deep(.markdown-live-photo-container) {
  --markdown-image-max-height: min(70vh, 46rem);
  width: 100%;
  max-width: 100%;
  margin-inline: auto;
}

.markdown-body :deep(.markdown-image-wrapper),
.markdown-body :deep(.markdown-live-photo-container > .live-photo-wrapper) {
  width: min(100%, calc(var(--markdown-image-max-height) * var(--markdown-image-ratio, 999)));
  max-width: 100%;
  max-height: var(--markdown-image-max-height);
  margin-inline: auto;
}

.markdown-body :deep(.markdown-image-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.markdown-body :deep(.markdown-image) {
  display: block;
  width: auto;
  height: 100%;
  max-width: 100%;
  max-height: var(--markdown-image-max-height);
  object-fit: contain;
}

.markdown-body :deep(.markdown-live-photo-container > .live-photo-wrapper) {
  overflow: hidden;
}

.markdown-body :deep(.markdown-live-photo-container .live-photo-image),
.markdown-body :deep(.markdown-live-photo-container .live-photo-video) {
  object-fit: contain;
}

.markdown-body
  :deep(p:not(.markdown-callout p):not(.markdown-card p):not(.swiper-slide-title p):not(.markdown-repo p):not(blockquote p):not(.aplayer-lrc p)) {
  text-indent: 2em;
}

.markdown-body :deep(h1):not(.markdown-callout h1):not(.markdown-card h1):not(.swiper-slide-title h1):not(.markdown-repo h1),
.markdown-body :deep(h2):not(.markdown-callout h2):not(.markdown-card h2):not(.swiper-slide-title h2):not(.markdown-repo h2),
.markdown-body :deep(h3):not(.markdown-callout h3):not(.markdown-card h3):not(.swiper-slide-title h3):not(.markdown-repo h3),
.markdown-body :deep(h4):not(.markdown-callout h4):not(.markdown-card h4):not(.swiper-slide-title h4):not(.markdown-repo h4),
.markdown-body :deep(h5):not(.markdown-callout h5):not(.markdown-card h5):not(.swiper-slide-title h5):not(.markdown-repo h5),
.markdown-body :deep(h6):not(.markdown-callout h6):not(.markdown-card h6):not(.swiper-slide-title h6):not(.markdown-repo h6) {
  font-weight: 700;
  line-height: 1.3;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  /* border-bottom: 1px solid rgb(229 231 235); */
  padding-bottom: 0.3em;
}

.dark .markdown-body :deep(h1) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  /* border-bottom: 1px solid rgb(229 231 235); */
  padding-bottom: 0.3em;
}

.dark .markdown-body :deep(h2) {
  border-bottom-color: rgb(55 65 81);
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
}

.markdown-body :deep(h4) {
  font-size: 1em;
}

.markdown-body :deep(a) {
  color: rgb(37 99 235);
  text-decoration: none;
}

.markdown-body :deep(a:hover):not(.markdown-card a):not(.markdown-simple-card a):not(.markdown-repo a) {
  text-decoration: underline;
}

.dark .markdown-body :deep(a) {
  color: rgb(96 165 250);
}

/* 已知域名行内链接的左侧域名图标：空 span + inline maskImage + currentColor，随文字色自适应深浅色。
   maskImage 由 onMounted 动态设（不走 CSS url()，避免 buildAssetsDir: "/" 时被 Vite rewrite 成带 hash 路径）。 */
.markdown-body :deep(.markdown-link-icon) {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex: none;
  margin-inline-end: 0.1em;
  vertical-align: -0.15em;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  -webkit-mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
  mask-position: center;
}

.markdown-body :deep(.markdown-link-icon--tencent) {
  --mk-icon: var(--mk-icon--tencent, url("/icons/tencent.svg"));
}

.markdown-body :deep(ul):not(.markdown-callout ul):not(.markdown-card ul):not(.markdown-repo ul):not(.aplayer-list ul),
.markdown-body :deep(ol):not(.markdown-callout ol):not(.markdown-card ol):not(.markdown-repo ol):not(.aplayer-list ol) {
  padding-left: 2em;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li):not(.markdown-callout li):not(.markdown-card li):not(.markdown-repo li):not(.aplayer-list li) {
  margin: 0.5em 0;
  display: list-item;
}

.markdown-body :deep(blockquote):not(.markdown-callout blockquote):not(.markdown-card blockquote):not(.markdown-repo blockquote) {
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}

.dark .markdown-body :deep(blockquote):not(.markdown-callout blockquote):not(.markdown-card blockquote):not(.markdown-repo blockquote) {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

.markdown-body :deep(code:not(pre code)) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
}

.dark .markdown-body :deep(code:not(pre code)) {
  background: rgb(55 65 81);
}

/* Shiki 代码块样式 */
.markdown-body :deep(pre.shiki) {
  padding: 16px;
  overflow: visible;
  font-size: 0.875em;
  border-radius: 8px;
  position: relative;
  border: 1px solid rgb(229 231 235);
  counter-reset: line;
  /* 防止内容溢出容器 */
  max-width: 100%;
}

/* 代码内容单独处理滚动 */
.markdown-body :deep(pre.shiki > code) {
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding-block: 4px;
  /* 长代码自动换行 */
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  /* 默认隐藏滚动条 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

/* 悬浮时显示滚动条 */
.markdown-body :deep(pre.shiki:hover > code) {
  scrollbar-width: auto; /* Firefox */
}

.markdown-body :deep(pre.shiki:hover > code)::-webkit-scrollbar {
  display: block; /* Chrome, Safari, Opera */
}

/* 美化滚动条样式 */
.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar {
  height: 8px;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-track {
  background: transparent;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb {
  background: rgb(209 213 219);
  border-radius: 4px;
}

.markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb:hover {
  background: rgb(156 163 175);
}

.dark .markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb {
  background: rgb(75 85 99);
}

.dark .markdown-body :deep(pre.shiki > code)::-webkit-scrollbar-thumb:hover {
  background: rgb(107 114 128);
}

.dark .markdown-body :deep(pre.shiki) {
  border-color: rgb(55 65 81);
}

/* Shiki 双主题切换 - 使用 CSS 变量 */
/* 暗色模式下应用暗色主题的 CSS 变量 */
.dark .markdown-body :deep(pre.shiki),
.dark .markdown-body :deep(pre.shiki span),
.dark .markdown-body :deep(pre.shiki code),
.dark .markdown-body :deep(pre.shiki .line) {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}

/* 暗色模式下行号颜色 */
.dark .markdown-body :deep(pre.shiki code .line::before) {
  color: var(--shiki-dark) !important;
  opacity: 0.5;
}

/* 代码块折叠 - 只显示前14行 */
.markdown-body :deep(pre.shiki.code-collapsed) {
  max-height: calc(1.8em * 12 + 32px);
  overflow: hidden;
}

.markdown-body :deep(pre.shiki.code-collapsed > code) {
  overflow: hidden;
}

.markdown-body :deep(pre.shiki.code-collapsed .code-expand-button) {
  position: absolute;
  inset: auto 0 0;
  z-index: 3;
  width: 100%;
  padding: 18px 8px 8px;
  text-align: center;
  font-family: "Noto Serif SC", serif;
  font-size: 12px;
  line-height: 1;
  color: rgb(107 114 128);
  background: linear-gradient(transparent, rgb(255 255 255));
  border: none;
  cursor: pointer;
}

.dark .markdown-body :deep(pre.shiki.code-collapsed .code-expand-button) {
  background: linear-gradient(transparent, rgb(17 24 39));
  color: rgb(156 163 175);
}

/* 代码行号 - 通过 CSS 计数器生成 */
.markdown-body :deep(pre.shiki > code) {
  counter-reset: line;
}

.markdown-body :deep(pre.shiki code .line) {
  display: block;
  position: relative;
  padding-left: 40px;
  line-height: 1.6;
  min-height: 22.4px;
}

.markdown-body :deep(pre.shiki code .line::before) {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 2em;
  margin-right: 1em;
  text-align: right;
  color: rgb(156 163 175);
  opacity: 0.5;
  /* font-size: 0.85em; */
  user-select: none;
  position: absolute;
  left: -1px;
}

.dark .markdown-body :deep(pre.shiki code .line::before) {
  color: rgb(107 114 128);
}

/* [!code highlight] / [!code hl] 高亮行 */
.markdown-body :deep(pre.shiki .line.highlighted) {
  background-color: rgb(241 200 80 / 0.16);
}

/* [!code ++] 新增行 / [!code --] 删除行 */
.markdown-body :deep(pre.shiki .line.diff.add) {
  background-color: rgb(46 160 67 / 0.14);
}

.markdown-body :deep(pre.shiki .line.diff.remove) {
  background-color: rgb(248 81 73 / 0.14);
}

/* diff 行号前缀：行号数字左侧空白处显示 + / -，不推动数字、不破坏代码列对齐 */
.markdown-body :deep(pre.shiki .line.diff.add::after) {
  content: "+";
  position: absolute;
  left: 4px;
  top: 0;
  color: rgb(46 160 67);
}

.markdown-body :deep(pre.shiki .line.diff.remove::after) {
  content: "-";
  position: absolute;
  left: 4px;
  top: 0;
  color: rgb(248 81 73);
}

/* 暗色模式：!important 覆盖 .line 的 --shiki-dark-bg !important 背景 */
.dark .markdown-body :deep(pre.shiki .line.highlighted) {
  background-color: rgb(237 197 80 / 0.2) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.add) {
  background-color: rgb(63 185 80 / 0.2) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.remove) {
  background-color: rgb(248 81 73 / 0.24) !important;
}

.dark .markdown-body :deep(pre.shiki .line.diff.add::after) {
  color: rgb(74 222 128);
}

.dark .markdown-body :deep(pre.shiki .line.diff.remove::after) {
  color: rgb(248 113 113);
}

/* 代码复制按钮 */
.markdown-body :deep(pre.shiki .lang-label) {
  position: absolute;
  top: 8px;
  right: 36px;
  max-width: 96px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgb(243 244 246);
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: rgb(107 114 128);
  opacity: 0.72;
  transition: opacity 0.2s;
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文件名标签 - 右上角显示 */
.markdown-body :deep(pre.shiki.has-file-name .file-label) {
  position: absolute;
  top: 6px;
  right: 36px;
  left: auto;
  background: white;
  padding: 4px 12px 0 12px;
  border-radius: 6px 6px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: rgb(55 65 81);
  z-index: 2;
  opacity: 1;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.markdown-body :deep(pre.shiki:hover .lang-label) {
  opacity: 1;
}

.dark .markdown-body :deep(pre.shiki .lang-label) {
  background: rgb(55 65 81);
  color: rgb(156 163 175);
}

.markdown-body :deep(pre.shiki .copy-button) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
  color: rgb(107 114 128);
}

.markdown-body :deep(pre.shiki:hover .copy-button),
.markdown-body :deep(pre.shiki.has-file-name:hover .file-label) {
  opacity: 1;
}

.markdown-body :deep(pre.shiki .copy-button:hover) {
  opacity: 1;
  color: rgb(37 99 235);
}

/* 复制成功状态 */
.markdown-body :deep(pre.shiki .copy-button.copied) {
  opacity: 1;
  color: rgb(34 197 94);
}

.dark .markdown-body :deep(pre.shiki .copy-button) {
  color: rgb(156 163 175);
}

.dark .markdown-body :deep(pre.shiki .copy-button:hover) {
  color: rgb(96 165 250);
}

.dark .markdown-body :deep(pre.shiki .copy-button.copied) {
  color: rgb(74 222 128);
}

.dark .markdown-body :deep(pre.shiki.has-file-name::before) {
  background: rgb(31 41 55);
  border-bottom-color: rgb(55 65 81);
}

/* 文件名标签样式 - 右上角显示，复用语言标签的样式规格 */
.markdown-body :deep(pre.shiki.has-file-name .file-label) {
  position: absolute;
  top: 6px;
  right: 36px;
  left: auto;
  background: rgb(243 244 246);
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  color: rgb(107 114 128);
  opacity: 0.72;
  transition: opacity 0.2s;
  pointer-events: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 添加文件图标（仅 has-icon 时渲染，图标 URL 由 JS 通过 --icon-url 传入） */
.markdown-body :deep(pre.shiki .file-label.has-icon::before) {
  content: "";
  display: inline-block;
  width: 12px;
  height: 12px;
  background-image: var(--icon-url);
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
  border-radius: 2px;
}

.dark .markdown-body :deep(pre.shiki.has-file-name .file-label) {
  background: rgb(55 65 81);
  color: rgb(229 231 235);
}

/* 复制按钮位置调整 - 在带文件名的代码块中 */
.markdown-body :deep(pre.shiki.has-file-name .copy-button) {
  top: 6px;
  right: 8px;
}

/* 带文件名的代码块中隐藏语言标签 - 语言信息已经包含在文件名标题里了 */
.markdown-body :deep(pre.shiki.has-file-name .lang-label) {
  display: none;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
}

.markdown-body :deep(table th),
.markdown-body :deep(table td) {
  padding: 0.5em 1em;
  border: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(table th),
.dark .markdown-body :deep(table td) {
  border-color: rgb(55 65 81);
}

.markdown-body :deep(table th) {
  background: rgb(249 250 251);
  font-weight: 600;
}

.dark .markdown-body :deep(table th) {
  background: rgb(31 41 55);
}

.markdown-body :deep(hr) {
  margin: 2em 0;
  border: none;
  border-top: 1px solid rgb(229 231 235);
}

.dark .markdown-body :deep(hr) {
  border-top-color: rgb(55 65 81);
}
</style>
