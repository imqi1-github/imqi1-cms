<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";

import {siteConfig} from "~~/site.config";
import type {TocItem} from "~/types/apis/toc";

// 获取路由
const route = useRoute();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 获取协议页面数据
const { data, pending, error, refresh } = await useFetch("/api/page/agreement", {
  headers: getInternalRequestHeaders(),
});

const page = computed(() => data.value?.data);

// 仅当真实 404（页面不存在）才算未找到，避免瞬时 500/超时被 SSR 固化成 404、误显示「页面未找到」。
// 对照 category/[slug].vue：用 error.statusCode===404 判别，其余错误走 isError 呈现可重试态。
const isNotFound = computed(() => !pending.value && !page.value && (error.value?.statusCode === 404 || error.value?.status === 404));
// 非 404 的加载错误（瞬时 DB 抖动/网络/超时）：保留标题并给重试，不触发 setResponseStatus(404)
const isError = computed(() => !pending.value && !!error.value && !isNotFound.value);

// 协议页不存在时让 SSR 返回 404（后端 API 已抛 404，但页面需显式设置状态码，否则 SSR 返 200 形成 soft-404）
if (import.meta.server) {
  const event = useRequestEvent();
  if (event && isNotFound.value) setResponseStatus(event, 404);
}

// 设置页面标题（用于面包屑）
const { setPageTitle } = usePageTitle();

// 页面标题
const pageTitle = ref(`协议 - ${siteName.value}`);

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
  // generateSlug 只保留 \w 与中文，会把 C++/C#、同名标题洗成相同 id；按「基础 slug」计数保证目录 key 唯一
  const slugCounts: Record<string, number> = {};

  headings.forEach(heading => {
    // 直接使用标题文本生成 id
    const text = heading.textContent || "";
    const base = generateSlug(text);
    // 首现用 base；再出现 -> base-1, base-2 ...（按 base 计数，避免后缀自身再冲突）
    slugCounts[base] = (slugCounts[base] || 0) + 1;
    const id = slugCounts[base] === 1 ? base : `${base}-${slugCounts[base] - 1}`;

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
const handleTocClick = (id: string) => {
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
    // 统一用 getBoundingClientRect + window.scrollY 换算到文档坐标（与 scrollToHeading 同口径），
    // 避免 offsetTop 相对 .article-body（transform 祖先）与 window.scrollY 基准不一致、高亮提前切换
    const scrollTop = window.scrollY + 120;

    let currentId = "";
    headings.forEach(heading => {
      const headingTop = (heading as HTMLElement).getBoundingClientRect().top + window.scrollY;
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

usePageSeo({
  title: pageTitle,
  description: siteConfig.pageSeo.agreement.description,
  keywords: siteConfig.pageSeo.agreement.keywords,
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

// markdown 正文客户端增强（代码块复制/折叠、表格转置、横向滚动羽化、富组件、图片水合等）
// 统一由 MarkdownBody 内部 onMounted/onUnmounted 调用,本页无需再手动 mount/cleanup。
// 目录提取与 hash 滚动是页面级关注点,留在本页 onMounted。

// 初始化目录与 hash 滚动
onMounted(() => {
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
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"/>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 404 状态 -->
    <div
      v-else-if="isNotFound"
      v-scroll-reveal="{ threshold: 0.01, rootMargin: '0px', translateY: 20 }"
      class="text-center flex items-center justify-center flex-col place-self-center justify-self-center size-full">
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

    <!-- 非 404 加载错误：给重试，避免瞬时故障被渲染成 NotFound/被 SSR 写成 404 -->
    <div v-else-if="isError" class="text-center py-24">
      <p class="text-lg text-slate-600 dark:text-slate-400 mb-6">加载失败，请稍后重试</p>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
        @click="refresh()">
        <Icon name="lucide:refresh-cw" class="size-4" />
        重试
      </button>
    </div>

    <!-- 页面内容 -->
    <div v-else-if="page" v-scroll-reveal="{ threshold: 0.01, rootMargin: '0px', translateY: 20 }">
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
          <nav class="toc-nav sticky top-12 pt-12">
            <h3 class="px-4 text-sm font-medium text-slate-900 dark:text-slate-100 mb-3">目录</h3>
            <ul v-if="showToc" class="space-y-1">
              <li v-for="item in tocItems" :key="item.id" class="wrap-anywhere overflow-hidden text-ellipsis">
                <button
                  :class="[
                    'w-full text-left px-2 py-1 text-sm rounded transition-colors duration-200 cursor-pointer',
                    'hover:bg-slate-100 dark:hover:bg-slate-800',
                    activeTocId === item.id
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-slate-600 dark:text-slate-400',
                  ]"
                  :style="{ paddingLeft: `${(item.level - 1) * 0.75 + 0.25}rem` }"
                  @click="handleTocClick(item.id)">
                  {{ item.text }}
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <!-- 协议正文：仅由外层 v-scroll-reveal 控制渐入；去掉内层 opacity-0 与 article-fade-in 动画的冗余揭示 -->
        <MarkdownBody :html="page.renderedContent" class="min-w-0 flex-1" />
      </div>
    </div>
  </div>
</template>

<style scoped>
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


/* 响应式 */
@media (max-width: 768px) {
  .text-\[3em\] {
    font-size: 2em;
  }
}

/* 目录文本换行 */
.wrap-anywhere {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
