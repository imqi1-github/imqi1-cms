<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

// 获取路由
const route = useRoute();
const router = useRouter();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");

// 获取协议页面数据
const { data, pending, error } = await useFetch("/api/page/agreement", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});

const page = computed(() => data.value?.data);

// 判断页面是否存在
const isNotFound = computed(() => !pending.value && (!page.value || error.value));

// 设置页面标题（用于面包屑）
const { setPageTitle } = usePageTitle();

// 页面标题
const pageTitle = ref(`协议 - ${siteName.value}`);

// 目录相关
interface TocItem {
  id: string;
  text: string;
  level: number;
}

const tocItems = ref<TocItem[]>([]);
const activeTocId = ref("");

// 协议页始终显示目录容器
const showToc = ref(true);

// 提取目录
const extractToc = () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  const content = document.querySelector(".markdown-body");
  if (!content) return;

  const headings = content.querySelectorAll("h1, h2, h3");
  const items: TocItem[] = [];

  headings.forEach(heading => {
    // 直接使用标题文本生成 id
    const text = heading.textContent || "";
    const id = generateSlug(text);

    // 给标题元素设置 id
    (heading as HTMLElement).id = id;

    items.push({
      id,
      text,
      level: parseInt(heading.tagName.charAt(1)),
    });
  });

  tocItems.value = items;
};

// 滚动到指定标题
const scrollToHeading = (id: string) => {
  const element = document.getElementById(id);
  if (element) {
    const offset = 100; // 顶部偏移量（导航栏高度 + 额外间距）
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = element.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }
};

// 点击目录项，只滚动不更新 URL
const handleTocClick = (id: string, text: string) => {
  scrollToHeading(id);
};

// 根据标题生成 slug（用于 id）
const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // 空格替换为短横线
    .replace(/[^\w\u4e00-\u9fa5-]/g, ""); // 只保留字母、数字、中文和短横线
};

// 根据 URL hash 查找对应的标题 ID
const findHeadingIdByHash = (hash: string): string | null => {
  if (!hash) return null;

  // 移除 # 符号
  const hashText = hash.slice(1);

  // 直接查找匹配的 id
  const matchingItem = tocItems.value.find(item => item.id === hashText);

  return matchingItem?.id || null;
};

// 处理 URL hash 滚动
const handleHashScroll = async () => {
  if (!import.meta.client || !route.hash) return;

  // 等待 DOM 更新和目录提取完成
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 100));

  const headingId = findHeadingIdByHash(route.hash);
  if (headingId) {
    scrollToHeading(headingId);
  }
};

// 监听滚动，更新当前激活的目录项
const handleTocScroll = () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  try {
    const headings = document.querySelectorAll(".markdown-body h1, .markdown-body h2, .markdown-body h3");
    const scrollTop = window.scrollY + 120;

    let currentId = "";
    headings.forEach(heading => {
      const headingTop = (heading as HTMLElement).offsetTop;
      if (scrollTop >= headingTop) {
        currentId = heading.id;
      }
    });

    activeTocId.value = currentId;
  } catch (error) {
    console.error("目录滚动监听错误:", error);
  }
};

// 在数据加载完成后更新标题
watch(
  [page, isNotFound, pending],
  ([newPage, notFound, isLoading]) => {
    // 只在数据加载完成后且页面存在时更新标题
    if (!isLoading && newPage?.title) {
      pageTitle.value = `${newPage.title} - ${siteName.value}`;
      setPageTitle(newPage.title, "ri:file-text-line");
    } else if (!isLoading && notFound) {
      pageTitle.value = `页面未找到 - ${siteName.value}`;
      setPageTitle("页面未找到", "ri:close-large-fill");
    }
  },
  { immediate: true },
);

useHead({
  title: pageTitle,
});

// 监听 404 状态，触发错误页动画
watch(isNotFound, () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  if (isNotFound.value) {
    nextTick(() => {
      const notFoundElement = document.querySelector(".animate-fade-in");
      if (notFoundElement && !notFoundElement.classList.contains("fade-in-start")) {
        notFoundElement.classList.add("fade-in-start");
      }
    });
  }
});

// 监听页面数据加载完成，触发渐入动画
watch(page, newPage => {
  if (!import.meta.client || !newPage) return;

  nextTick(() => {
    const pageContent = document.querySelector(".animate-fade-in:not(.fade-in-start)");
    if (pageContent) {
      pageContent.classList.add("fade-in-start");
    }
  });
});

// 监听路由 hash 变化
watch(
  () => route.hash,
  newHash => {
    if (newHash) {
      handleHashScroll();
    }
  },
);

// 初始化滚动渐入动画
onMounted(() => {
  // 初始化滚动渐入动画
  const observerOptions = {
    threshold: 0.01,
    rootMargin: "0px",
  };

  const fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素（包括404和正常内容）
  nextTick(() => {
    document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
      fadeInObserver.observe(el);
    });
  });

  // 初始化目录和处理 hash 滚动
  nextTick(async () => {
    extractToc();
    window.addEventListener("scroll", handleTocScroll);

    // 处理页面加载时的 hash
    if (route.hash) {
      await handleHashScroll();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleTocScroll);
});
</script>

<template>
  <div class="max-w-275 mx-auto">
    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 404 状态 -->
    <div
      v-else-if="isNotFound"
      class="text-center flex items-center justify-center flex-col place-self-center justify-self-center size-full animate-fade-in">
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

    <!-- 页面内容 -->
    <div v-else-if="page" class="animate-fade-in">
      <!-- 标题区域 -->
      <header class="text-center">
        <h1 class="text-[3em] font-extrabold mb-2.5">{{ page.title }}</h1>

        <!-- 描述 -->
        <div v-if="page.desc" class="text-[0.8em] text-slate-600 dark:text-slate-400 mb-4">
          {{ page.desc }}
        </div>
      </header>

      <!-- 协议内容区域 - 带目录 -->
      <div class="flex gap-8 relative w-full max-w-7xl mx-auto">
        <!-- 目录侧边栏 - 左侧 -->
        <aside class="toc-sidebar hidden lg:block w-39 shrink-0 order-first">
          <nav class="toc-nav sticky top-24">
            <h3 class="px-4 text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">目录</h3>
            <ul class="space-y-1" v-if="showToc">
              <li v-for="item in tocItems" :key="item.id" class="wrap-anywhere overflow-hidden text-ellipsis">
                <button
                  @click="handleTocClick(item.id, item.text)"
                  :class="[
                    'w-full text-left px-2 py-1 text-sm rounded transition-colors duration-200',
                    'hover:bg-slate-100 dark:hover:bg-slate-800',
                    activeTocId === item.id
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-600 dark:text-slate-400',
                  ]"
                  :style="{ paddingLeft: `${(item.level - 1) * 0.75 + 0.25}rem` }">
                  {{ item.text }}
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <!-- 协议正文 -->
        <div class="min-w-0 flex-1 opacity-0 translate-y-8 duration-300 ease-out markdown-body article-body" v-html="page.renderedContent"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 渐入动画基础类 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
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

/* 封面和评论区约束宽度 */
.article-cover {
  width: 100%;
}

.article-constrained {
  max-width: 56.25rem; /* 900px - same as max-w-225 */
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

/* 目录样式 */
.toc-sidebar {
  position: relative;
  opacity: 0;
  transform: translateX(-20px);
  animation: toc-slide-in 0.5s ease-out forwards;
  animation-delay: 0.3s;
}

@keyframes toc-slide-in {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toc-nav {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.toc-nav::-webkit-scrollbar {
  width: 4px;
}

.toc-nav::-webkit-scrollbar-track {
  background: transparent;
}

.toc-nav::-webkit-scrollbar-thumb {
  background: rgb(203 213 225);
  border-radius: 2px;
}

.dark .toc-nav::-webkit-scrollbar-thumb {
  background: rgb(71 85 105);
}

/* 正文样式 */
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}

.markdown-body > * ~ * {
  margin-top: 1.5em;
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

.markdown-body :deep(img:not(.swiper-container img)) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 20px 0;
  cursor: zoom-in;
  max-height: 600px;
  margin: auto;
}

.markdown-body :deep(p:not(.markdown-callout p):not(.markdown-card p):not(.swiper-slide-title p):not(.markdown-repo p):not(blockquote p):not(.aplayer-lrc p)) {
  margin: 1em 0;
  text-indent: 2em;
}

.markdown-body :deep(h1):not(.markdown-callout h1):not(.markdown-card h1):not(.swiper-slide-title h1):not(.markdown-repo h1),
.markdown-body :deep(h2):not(.markdown-callout h2):not(.markdown-card h2):not(.swiper-slide-title h2):not(.markdown-repo h2),
.markdown-body :deep(h3):not(.markdown-callout h3):not(.markdown-card h3):not(.swiper-slide-title h3):not(.markdown-repo h3),
.markdown-body :deep(h4):not(.markdown-callout h4):not(.markdown-card h4):not(.swiper-slide-title h4):not(.markdown-repo h4),
.markdown-body :deep(h5):not(.markdown-callout h5):not(.markdown-card h5):not(.swiper-slide-title h5):not(.markdown-repo h5),
.markdown-body :deep(h6):not(.markdown-callout h6):not(.markdown-card h6):not(.swiper-slide-title h6):not(.markdown-repo h6) {
  margin-block: 0.5em;
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

.markdown-body :deep(ul):not(.markdown-callout ul):not(.markdown-card ul):not(.markdown-repo ul):not(.aplayer-list ul),
.markdown-body :deep(ol):not(.markdown-callout ol):not(.markdown-card ol):not(.markdown-repo ol):not(.aplayer-list ol) {
  margin: 1em 0;
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
  margin: 1em 0;
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
  width: 2em;
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

/* 正文内容动画 */
.article-body {
  animation: article-fade-in 0.5s ease-out forwards;
}

@keyframes article-fade-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 目录文本换行 */
.wrap-anywhere {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
