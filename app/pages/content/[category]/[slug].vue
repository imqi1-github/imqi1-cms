<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { Fancybox } from "@fancyapps/ui";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import "@/assets/css/fancybox.css";

const route = useRoute();
const categorySlug = route.params.category as string;
const slug = route.params.slug as string;

// 格式化日期
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

// 获取文章数据 - 使用新的 API 格式
const { data, pending, error } = await useFetch(`/api/posts/${categorySlug}/${slug}`);

const post = computed(() => data.value?.data);

// 判断文章是否存在
const isNotFound = computed(() => !pending.value && (!post.value || error.value));

const categories = computed(() => post.value?.relations?.map(r => r.category) || []);
const covers = computed(() => post.value?.parsedCovers || []);
const tags = computed(() => post.value?.tags || []);

// 判断封面类型
const hasCover = computed(() => covers.value.length > 0);
const hasManyCovers = computed(() => post.value?.many_covers && covers.value.length > 1);
const firstCover = computed(() => covers.value[0]?.url || "");

const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");

// 判断是否为图片分类
const photoCategorySlug = computed(() => siteData.value?.data?.photoCategorySlug || "shot");
const isPhotoCategory = computed(() => categorySlug === photoCategorySlug.value);

// 页面元数据
useHead({
  title: computed(() => {
    if (pending.value) return `文章加载中... - ${siteName.value}`;
    if (isNotFound.value) return `页面未找到 - ${siteName.value}`;
    return `${post.value?.title} - ${siteName.value}` || `文章加载中... - ${siteName.value}`;
  }),
});

// 初始化滚动渐入动画和 Fancybox
onMounted(() => {
  // 页面渐入动画 - 直接触发，不需要滚动监听
  requestAnimationFrame(() => {
    // 触发 404 页面动画
    const notFound = document.querySelector(".not-found-fade-in");
    if (notFound && isNotFound.value) {
      notFound.classList.add("fade-in-start");
      return;
    }

    const article = document.querySelector("article.animate-fade-in");
    const header = article?.querySelector("header.article-cover");
    const contentBody = article?.querySelector(".content-body");
    const commentSection = article?.querySelector("section.opacity-0");

    header?.classList.remove("opacity-0", "translate-y-8");
    header?.classList.add("opacity-100", "translate-y-0");
    contentBody?.classList.remove("opacity-0", "translate-y-8");
    contentBody?.classList.add("opacity-100", "translate-y-0");
    commentSection?.classList.remove("opacity-0", "translate-y-8");
    commentSection?.classList.add("opacity-100", "translate-y-0");
  });

  // 初始化 Fancybox（参照友情链接页面）
  // @ts-ignore
  Fancybox.bind("[data-fancybox]", {
    l10n: zh_CN,
    placeFocusBack: false,
    Hash: false,
    trapFocus: false,
    closeExisting: false,
    zoomEffect: true,
    Carousel: {
      Panzoom: {
        maxScale: 2,
      },
      Toolbar: {
        display: {
          left: ["infobar"],
          middle: ["zoomIn", "zoomOut", "toggle1to1"],
          right: ["thumbs", "close"],
        },
      },
      Autoplay: false,
    },
    idle: false,
    autoFocus: false,
  });

  // 初始化代码复制按钮
  document.querySelectorAll(".markdown-body pre.shiki").forEach(pre => {
    const code = pre.querySelector("code");
    // 提取语言名称
    let lang = "";
    if (code) {
      const langClass = Array.from(code.classList).find(c => c.startsWith("language-"));
      if (langClass) {
        lang = langClass.replace("language-", "");
      }
    }

    // 语言显示名称映射
    const langNames: Record<string, string> = {
      js: "JavaScript",
      ts: "TypeScript",
      jsx: "JSX",
      tsx: "TSX",
      vue: "Vue",
      py: "Python",
      rb: "Ruby",
      go: "Go",
      rs: "Rust",
      java: "Java",
      kt: "Kotlin",
      swift: "Swift",
      scala: "Scala",
      cpp: "C++",
      c: "C",
      cs: "C#",
      php: "PHP",
      sql: "SQL",
      sh: "Shell",
      bash: "Bash",
      yaml: "YAML",
      yml: "YAML",
      json: "JSON",
      toml: "TOML",
      xml: "XML",
      html: "HTML",
      css: "CSS",
      scss: "SCSS",
      less: "Less",
      md: "Markdown",
      mermaid: "Mermaid",
    };
    const displayLang = langNames[lang] || lang.toUpperCase();

    // 检测代码行数，超过14行则折叠
    const lineCount = code?.querySelectorAll(".line").length || 0;
    const isCollapsed = lineCount > 14;

    if (isCollapsed) {
      pre.classList.add("code-collapsed");
    }

    // 点击代码块切换折叠状态
    pre.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      // 不处理复制按钮的点击
      if (target.closest(".copy-button")) return;

      pre.classList.toggle("code-collapsed");
    });

    // 创建语言标签
    const langLabel = document.createElement("span");
    langLabel.className = "lang-label";
    langLabel.textContent = displayLang;

    // 创建复制按钮
    const button = document.createElement("button");
    button.className = "copy-button";
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    button.ariaLabel = "复制代码";

    const copyIcon = button.innerHTML;
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const copyCode = async (e: Event) => {
      e.stopPropagation(); // 阻止冒泡，避免触发折叠切换
      if (code) {
        const text = code.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // fallback for older browsers
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        button.classList.add("copied");
        button.innerHTML = checkIcon;
        setTimeout(() => {
          button.classList.remove("copied");
          button.innerHTML = copyIcon;
        }, 2000);
      }
    };

    button.addEventListener("click", copyCode);
    pre.appendChild(langLabel);
    pre.appendChild(button);
  });
});

// 清理 Fancybox
onUnmounted(() => {
  Fancybox.destroy();
});
</script>

<template>
  <div :class="['mx-auto px-5 py-8', isPhotoCategory ? 'max-w-full' : 'max-w-225']">
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <div v-else-if="isNotFound" class="text-center flex items-center justify-center flex-col place-self-center justify-self-center size-full not-found-fade-in">
      <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
        <Icon name="ri:close-large-fill" class="text-red-500" />
        <span>页面未找到</span>
      </h1>

      <p class="text-lg text-slate-600 dark:text-slate-400 mb-8">
        未找到内容，你可以
        <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>
        。
      </p>
    </div>

    <article v-else class="flex flex-col animate-fade-in">
      <!-- 标题区域 -->
      <header :class="['mb-5 opacity-0 translate-y-8 duration-600 ease-out', !hasCover ? 'flex flex-col items-center' : '']" class="article-cover">
        <!-- 多封面轮播 -->
        <CoverSwiper v-if="hasManyCovers" :covers="covers" :is-photo-category="isPhotoCategory" />

        <!-- 单封面 -->
        <img
          v-else-if="hasCover"
          :src="firstCover"
          alt="封面"
          data-fancybox="gallery"
          :data-caption="covers[0]?.desc || '封面'"
          :class="[
            'w-full h-auto object-cover border border-gray-200 mb-5 cursor-zoom-in',
            isPhotoCategory ? 'max-h-[600px]' : 'max-h-37.5'
          ]"
          loading="lazy" />

        <!-- 标题 -->
        <h1 id="article-title" class="text-[3em] font-extrabold leading-tight mb-2.5 text-slate-900 dark:text-slate-100 break-words">
          {{ post.title }}
        </h1>

        <!-- 描述/摘要 -->
        <div v-if="post.desc" class="text-[1.1em] text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
          {{ post.desc }}
        </div>

        <!-- 元信息 -->
        <div class="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400 pt-2.5">
          <span class="inline-flex items-center gap-1">
            <Icon name="ri:user-line" class="size-4" />
            <span>{{ post.user?.nickname || post.user?.name || "匿名" }}</span>
          </span>
          <span class="inline-flex items-center gap-1">
            <Icon name="ri:edit-2-line" class="size-4" />
            <time :datetime="post.update_time">
              {{ formatDate(post.update_time) }}
            </time>
          </span>
          <span v-if="categories.length > 0" class="inline-flex items-center gap-1">
            <Icon name="ri:menu-line" class="size-4" />
            <NuxtLink
              v-for="(cat, index) in categories"
              :key="cat.mid"
              :to="`/category/${cat.slug}`"
              class="text-inherit no-underline transition-colors hover:text-blue-600"
            >
              {{ cat.name }}{{ index < categories.length - 1 ? ', ' : '' }}
            </NuxtLink>
          </span>
          <span v-if="tags.length > 0" class="inline-flex items-center gap-1">
            <Icon name="ri:price-tag-3-line" class="size-4" />
            <span v-for="(tag, index) in tags" :key="index" class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[0.9em]">
              {{ tag }}
            </span>
          </span>
        </div>
      </header>

      <!-- 文章内容 - 服务端已渲染 -->
      <div class="mt-8 opacity-0 translate-y-8 duration-600 ease-out markdown-body content-body" v-html="post.renderedContent"></div>

      <!-- 评论区 -->
      <section class="mt-10 opacity-0 translate-y-8 duration-600 ease-out">
        <CommentList :post-id="post.cid" />
      </section>
    </article>
  </div>
</template>

<style scoped>
/* 渐入动画基础类 */
.animate-fade-in {
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 404 页面淡入动画 */
.not-found-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.not-found-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}

.opacity-0 {
  opacity: 0;
}

.opacity-100 {
  opacity: 1;
}

.translate-y-0 {
  transform: translateY(0);
}

.translate-y-8 {
  transform: translateY(2rem);
}

.no-underline {
  text-decoration: none;
}

/* 正文样式 */
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}

/* 图片容器 */
.markdown-body :deep(.markdown-figure) {
  margin: 20px 0;
  text-align: center;
}

.markdown-body :deep(.markdown-figure img) {
  margin: auto;
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

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 20px 0;
  cursor: zoom-in;
  max-height: 600px;
  margin: auto;
}

.markdown-body :deep(p) {
  margin: 1em 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
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

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.dark .markdown-body :deep(a) {
  color: rgb(96 165 250);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 1em 0;
  padding-left: 2em;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li) {
  margin: 0.5em 0;
  display: list-item;
}

.markdown-body :deep(blockquote) {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}

.dark .markdown-body :deep(blockquote) {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

.markdown-body :deep(code:not(pre code)) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dark .markdown-body :deep(code:not(pre code)) {
  background: rgb(55 65 81);
}

/* Shiki 代码块样式 */
.markdown-body :deep(pre.shiki) {
  margin: 1em 0;
  padding: 16px;
  overflow: auto;
  font-size: 0.875em;
  line-height: 0.8;
  border-radius: 8px;
  position: relative;
  border: 1px solid rgb(229 231 235);
  counter-reset: line;
}

.dark .markdown-body :deep(pre.shiki) {
  border-color: rgb(55 65 81);
}

/* 代码块折叠 - 只显示前14行 */
.markdown-body :deep(pre.shiki.code-collapsed) {
  max-height: calc(0.8em * 14 + 32px);
  overflow: hidden;
  cursor: pointer;
}

.markdown-body :deep(pre.shiki.code-collapsed::after) {
  content: "...";
  font-family: "Noto Serif SC", serif;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: rgb(107 114 128);
  background: linear-gradient(transparent, rgb(255 255 255));
  pointer-events: none;
}

.dark .markdown-body :deep(pre.shiki.code-collapsed::after) {
  background: linear-gradient(transparent, rgb(17 24 39));
  color: rgb(156 163 175);
}

/* 展开状态 */
.markdown-body :deep(pre.shiki:not(.code-collapsed)) {
  cursor: pointer;
}

/* 代码行号 - 通过 CSS 计数器生成 */
.markdown-body :deep(pre.shiki code) {
  counter-reset: line;
}

.markdown-body :deep(pre.shiki code .line) {
  display: block;
  position: relative;
  padding-left: 0;
}

.markdown-body :deep(pre.shiki code .line::before) {
  counter-increment: line;
  content: counter(line);
  display: inline-block;
  width: 1.5em;
  margin-right: 1em;
  text-align: right;
  color: rgb(156 163 175);
  opacity: 0.5;
  font-size: 0.85em;
  user-select: none;
}

.dark .markdown-body :deep(pre.shiki code .line::before) {
  color: rgb(107 114 128);
}

/* 代码复制按钮 */
.markdown-body :deep(pre.shiki .lang-label) {
  position: absolute;
  top: 13px;
  right: 36px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(107 114 128);
  opacity: 0.5;
  transition: opacity 0.2s;
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

.markdown-body :deep(pre.shiki:hover .copy-button) {
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

.markdown-body :deep(table) {
  width: 100%;
  margin: 1em 0;
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

/* 响应式 */
@media (max-width: 768px) {
  .text-\[3em\] {
    font-size: 2em;
  }
}
</style>
