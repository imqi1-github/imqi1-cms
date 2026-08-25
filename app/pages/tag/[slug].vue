<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { siteConfig } from "~~/site.config";

const route = useRoute();
const router = useRouter();
// slug 取自 route.params：标签页每次导航重挂载（顶层 await useFetch → 异步 setup → Suspense 重新挂载），
// 保留 computed 供多处响应式读取。
const slug = computed(() => route.params.slug as string);

// apiSlug 仅在 setup 初始化（=当前标签），刻意【不】watch slug 变化：
// 旧实例在页面过渡期仍存活，若 apiSlug 跟随 route 变化，useFetch 会立即用新 slug 重新请求、data 被清空
// → 文章列表(v-if contents>0) 与分页被移除 → 根容器(flex justify-center) 把孤立的标题(含 # 图标)
// 瞬间居中到屏幕中央。重挂载下新实例 setup 自会用新 slug 初始化并请求；同时 apiSlug 固定也从根源
// 避免「导航到文章页时旧页用文章 slug 误请求 → 404」。
const apiSlug = ref(slug.value);

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const contentPageSize = computed(() => siteSettings.value?.contentPageSize || 12);

// 从 URL query 参数中获取页码
const initialPage = route.query.page ? parseInt(route.query.page as string) : 1;
const page = ref(initialPage > 0 ? initialPage : 1);

// 获取标签文章数据
// URL/watch 基于 apiSlug（仅标签页内同步）：切标签时重新请求，SPA 导航离开文章页时不再误请求
// 先挂满 fadeDuration 让旧页渐出，再拉数据（否则 useFetch 秒回时旧页没淡到位就替换）
await useFadeOutOnNavigate();
const { data, pending, error, refresh } = await useFetch(() => `/api/tag/${apiSlug.value}/contents`, {
  headers: getInternalRequestHeaders(),
  query: { page, pageSize: contentPageSize },
  watch: [page, apiSlug],
});

const tag = computed(() => data.value?.data?.tag);
const contents = computed(() => data.value?.data?.contents || []);
const pagination = computed(() => data.value?.data?.pagination);

// 页码越界钳制：?page=999 等越界直链会把 page 归位到最后一页，避免渲染「第999/4页 + 暂无文章」矛盾空态。
// immediate：SSR payload 已把 pagination 解析为 page=999/totalPages=4，水合时不会再有「变化」，须立即求值才会钳制。
// 仅客户端：SSR 不触发 router.replace。
watch(pagination, pg => {
  if (!import.meta.client || !pg || pg.totalPages < 1) return;
  if (page.value > pg.totalPages) {
    page.value = pg.totalPages;
    router.replace({ path: `/tag/${slug.value}`, query: { page: pg.totalPages.toString() } });
  }
}, { immediate: true });

// 判断是否为404 —— 仅当真实 404 才当作「标签不存在」；瞬时 500/超时等走 isError 呈现重试态，避免把有效标签烘焙成 404
const isNotFound = computed(() => !pending.value && !tag.value && (error.value?.statusCode === 404 || error.value?.status === 404));
// 非 404 的加载错误（瞬时 DB 抖动/网络/超时）：保留标题并给重试，不触发 setResponseStatus(404)
const isError = computed(() => !pending.value && !!error.value && !isNotFound.value);

// 标签不存在时让 SSR 返回 404（后端 API 已抛 404，但页面需显式设置状态码，否则 SSR 返 200 形成 soft-404）
if (import.meta.server) {
  const event = useRequestEvent();
  if (event && isNotFound.value) setResponseStatus(event, 404);
}

// 骨架屏显示状态
const showSkeleton = ref(false);
const isPaginating = ref(false);
const hasPlayedEntryFade = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
// 渐入/渐出相关 setTimeout 句柄集合：onBeforeUnmount 统一清空，
// 避免「切换标签重挂载」后旧实例的定时器在新页 document 上 querySelectorAll 窜改渐隐状态
const fadeTimers = new Set<ReturnType<typeof setTimeout>>();
let isUnmounted = false;
const trackFadeTimer = (id: ReturnType<typeof setTimeout>) => {
  fadeTimers.add(id);
  return id;
};

// 骨架屏数量 - 根据每页文章数量和当前页码动态调整
const skeletonCount = computed(() => {
  // 如果已经有数据，使用当前文章数量
  if (contents.value.length > 0) {
    return contents.value.length;
  }
  // 否则使用每页显示数量
  return contentPageSize.value || 12;
});

// 监听 pending，控制骨架屏显示
watch(pending, isLoading => {
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }

  if (isLoading) {
    // 如果是翻页操作，立即显示骨架屏
    if (isPaginating.value) {
      showSkeleton.value = true;
    } else if (tag.value) {
      // 首次加载，1秒后显示骨架屏
      skeletonTimer = setTimeout(() => {
        showSkeleton.value = true;
      }, 1000);
    }
  } else {
    showSkeleton.value = false;
    isPaginating.value = false;
  }
});

// 格式化日期
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}个月前`;
  if (weeks > 0) return `${weeks}周前`;
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

// 翻页
function goToPage(newPage: number) {
  // 标记为翻页操作，立即显示骨架屏
  isPaginating.value = true;

  // 瞬间滚动到页面顶端
  window.scrollTo(0, 0);

  // 直接更新页码，不进行渐出动画
  router.push({
    path: `/tag/${slug.value}`,
    query: { page: newPage.toString() },
  });
  page.value = newPage;
}

const hideFadeElements = (includeEntryFade = false) => {
  const selector = includeEntryFade ? ".fade-in-element, .entry-fade-element" : ".fade-in-element";

  document.querySelectorAll<HTMLElement>(selector).forEach(el => {
    el.classList.remove("opacity-100", "translate-y-0", "translate-y-8");
    el.classList.add("opacity-0", "translate-y-8");
  });
};

// 触发渐入动画
function triggerFadeIn(includeEntryFade = false) {
  nextTick(() => {
    requestAnimationFrame(() => {
      const selector = includeEntryFade ? ".fade-in-element, .entry-fade-element" : ".fade-in-element";

      document.querySelectorAll<HTMLElement>(selector).forEach(el => {
        el.classList.remove("opacity-0", "translate-y-8");
        el.classList.add("opacity-100", "translate-y-0");
      });
    });
  });
}

const triggerEntryFadeIn = () => {
  if (hasPlayedEntryFade.value) return;

  hasPlayedEntryFade.value = true;
  hideFadeElements(true);
  triggerFadeIn(true);
};

// 监听数据加载状态，触发渐入渐出动画
watch(pending, (newVal, oldVal) => {
  // 数据加载完成，触发渐入动画
  if (oldVal && !newVal) {
    // 设置页面标题供导航栏使用
    if (tag.value?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(`${tag.value.name}`, "ri:hashtag");
    }

    // 强制触发渐入动画 - 给足够时间让DOM渲染完成
    trackFadeTimer(setTimeout(() => {
      if (isUnmounted) return;
      const includeEntryFade = !hasPlayedEntryFade.value;
      hideFadeElements(includeEntryFade);
      // 需要下一帧再触发动画，否则浏览器会合并DOM更新导致动画不播放
      requestAnimationFrame(() => {
        triggerFadeIn(includeEntryFade);
        hasPlayedEntryFade.value = true;
      });
    }, 150));
  }

  // 开始加载新数据时，确保正文列表隐藏，标题和分页只在首次进入时渐入
  if (!oldVal && newVal && tag.value) {
    hideFadeElements();
  }
});

// 监听路由变化，确保 URL 参数变化时也能正确更新
watch(
  () => route.query.page,
  newPage => {
    // 确保用户仍然在标签页面
    if (!route.path.startsWith(`/tag/${slug.value}`)) {
      return;
    }

    const pageNum = newPage ? parseInt(newPage as string) : 1;
    if (pageNum > 0 && pageNum !== page.value) {
      isPaginating.value = true;
      page.value = pageNum;

      // 重置正文列表状态，标题和分页不参与翻页渐入
      hideFadeElements();

      // 等待数据加载完成后触发正文列表动画
      trackFadeTimer(setTimeout(() => {
        if (isUnmounted) return;
        triggerFadeIn();
      }, 300));
    }
  },
);

// 切换到不同标签由「重挂载 + 新实例 onMounted→triggerEntryFadeIn」处理；
// 这里不再 watch route.params.slug：旧实例响应它会把 page 重置为 1 触发 useFetch 重请求，
// data 被清空致文章列表被移除，根容器(flex justify-center) 把孤立标题(# 图标)居中到屏幕中央。

// 监听标签数据变化，设置标题
watch(
  tag,
  newTag => {
    if (newTag?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(`${newTag.name}`, "ri:hashtag");
    }
  },
  { immediate: true },
);

// 页面标题
usePageSeo({
  title: computed(() => {
    if (pending.value) return `加载中... - ${siteName.value}`;
    if (isError.value) return `加载失败 - ${siteName.value}`;
    if (isNotFound.value) return `标签不存在 - ${siteName.value}`;
    return `标签 ${tag.value?.name} - ${siteName.value}`;
  }),
  description: computed(() => (tag.value ? siteConfig.pageSeo.tag.description(tag.value.name) : "")),
  keywords: computed(() => (tag.value ? siteConfig.pageSeo.tag.keywords(tag.value.name) : "")),
});

// 初始化渐入动画
onMounted(() => {
  // 延迟触发，确保 DOM 完全渲染
  trackFadeTimer(setTimeout(() => {
    if (isUnmounted) return;
    triggerEntryFadeIn();
  }, 100));
});

onBeforeUnmount(() => {
  isUnmounted = true;
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }
  for (const id of fadeTimers) clearTimeout(id);
  fadeTimers.clear();
});
</script>

<template>
  <ClientOnly>
    <div class="max-w-225 mx-auto flex flex-col justify-center items-center">
      <!-- 404（加载由全局页面过渡兜底） -->
      <NotFound v-if="isNotFound" title="标签不存在" />

      <!-- 非 404 加载错误：保留标题并给重试，避免瞬时故障被渲染成 NotFound/被 SSR 写成 404 -->
      <div v-else-if="isError" class="py-24 text-center fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
        <Icon name="lucide:alert-circle" aria-hidden="true" class="size-12 text-destructive mx-auto mb-4" />
        <h2 class="text-xl font-bold mb-2">加载失败</h2>
        <p class="text-muted-foreground mb-4">请稍后重试</p>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
          @click="refresh()">
          <Icon name="lucide:refresh-cw" class="size-4" />
          重试
        </button>
      </div>

      <!-- 标签文章页 -->
      <template v-else>
        <!-- 标题 -->
        <header class="my-12 mx-auto w-fit entry-fade-element opacity-0 translate-y-8 duration-600 ease-out">
          <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
            <Icon name="ri:hashtag" class="inline-block size-8.5 mr-2" />
            {{ tag?.name }}
          </h1>
          <p v-if="tag?.desc" class="text-slate-600 dark:text-slate-400 mt-2">{{ tag.desc }}</p>
        </header>

        <!-- 文章列表 -->
        <div
          v-if="contents.length > 0 && !showSkeleton"
          class="grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <div
            v-for="content in contents"
            :key="content.cid"
            class="relative flex flex-col h-70 max-md:h-65 overflow-hidden rounded-[15px] shadow-sm hover:shadow-md border border-slate-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 group transition-all duration-300">
            <!-- 封面占满整卡 -->
            <NuxtLink
              v-if="content.covers.length > 0"
              :to="`/content/${content.categorySlug || 'uncategorized'}/${content.slug}`"
              class="absolute inset-0">
              <img
                :src="content.covers[0]?.url"
                :alt="content.title"
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                loading="lazy" >
              <!-- 多封面角标 -->
              <div
                v-if="content.many_covers && content.covers.length > 1"
                class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                <Icon name="ri-gallery-line" class="size-3.5" />
                <span>+{{ content.covers.length - 1 }}</span>
              </div>
              <!-- 关联地点角标 -->
              <div
                v-if="content.travelCount > 0"
                :class="content.many_covers && content.covers.length > 1 ? 'top-10' : 'top-2'"
                class="absolute right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                <Icon name="ri:map-pin-line" class="size-3.5" />
                <span>{{ content.travelCount }}</span>
              </div>
            </NuxtLink>

            <!-- 无封面占位 -->
            <div
              v-else
              class="flex-1 bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
              <span class="text-slate-400 dark:text-gray-500 text-6xl">{{ content.title[0] }}</span>
            </div>

            <!-- 文章信息（底部毛玻璃带） -->
            <div
              class="relative mt-auto w-full px-5 pb-2 pt-1.5"
              :class="content.covers.length > 0 ? 'cover-backdrop text-white' : 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md'">
              <NuxtLink
                :to="`/content/${content.categorySlug || 'uncategorized'}/${content.slug}`"
                class="text-[1.5em] font-extrabold block transition-colors"
                :class="content.covers.length > 0 ? 'text-white hover:text-blue-100' : 'text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-500'">
                {{ content.title }}
              </NuxtLink>

              <div
                class="text-[0.8em] flex flex-wrap gap-2"
                :class="content.covers.length > 0 ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'">
                <span v-tooltip="`最后更新时间`" class="flex items-center">
                  <Icon name="ri-time-line" class="size-4" />
                  {{ formatDate(content.updated) }}
                </span>
                <span v-if="content.categoryName" class="flex items-center">
                  <Icon name="ri:menu-line" class="size-4" />
                  <NuxtLink
                    v-tooltip="`分类`"
                    :to="`/category/${content.categorySlug}`"
                    class="mr-1 transition-colors"
                    :class="content.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400'">
                    {{ content.categoryName }}
                  </NuxtLink>
                </span>
                <span v-tooltip="`评论数量`" class="flex items-center">
                  <Icon name="ri-chat-2-line" class="size-4" />
                  {{ content.commentsNum > 0 ? content.commentsNum : "暂无评论" }}
                </span>
              </div>

              <p
                v-if="content.desc"
                class="text-[0.9em] overflow-wrap break-word"
                :class="content.covers.length > 0 ? 'text-white/70' : 'text-slate-600 dark:text-slate-400'">
                {{ content.desc }}
              </p>
            </div>
          </div>
        </div>

        <!-- 骨架屏 -->
        <div v-else-if="showSkeleton" class="grid grid-cols-1 md:grid-cols-2 w-full gap-5">
          <div
            v-for="i in skeletonCount"
            :key="`skeleton-${i}`"
            class="relative flex flex-col h-70 max-md:h-65 overflow-hidden rounded-[15px] bg-slate-100 dark:bg-gray-800 animate-pulse shadow-sm">
            <!-- 封面骨架（占满整卡） -->
            <div class="absolute inset-0 bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30"/>

            <!-- 文章信息骨架 -->
            <div class="relative mt-auto w-full px-5 pb-2 pt-1.5">
              <!-- 标题骨架 -->
              <div class="h-6 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse my-1"/>

              <!-- 信息骨架 -->
              <div class="flex items-center flex-wrap gap-2 my-1">
                <div class="h-3 w-16 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"/>
                <div class="h-3 w-20 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"/>
                <div class="h-3 w-16 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"/>
              </div>

              <!-- 描述骨架 -->
              <div class="h-3.5 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse overflow-wrap break-word"/>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div
          v-else-if="contents.length === 0 && !pending"
          class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          暂无文章
        </div>
      </template>

      <!-- 分页 -->
      <div v-if="pagination && pagination.totalPages > 1" class="entry-fade-element flex justify-center gap-2 mt-10 opacity-0 translate-y-8 duration-600 ease-out">
        <button
          v-if="pagination.page > 1"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          @click="goToPage(pagination.page - 1)">
          <Icon name="ri-arrow-left-double-line" />
        </button>

        <span class="px-4 py-2 text-slate-600 dark:text-slate-400"> 第 {{ pagination.page }} / {{ pagination.totalPages }} 页 </span>

        <button
          v-if="pagination.page < pagination.totalPages"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          @click="goToPage(pagination.page + 1)">
          <Icon name="ri-arrow-right-double-line" />
        </button>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* 渐入动画 */
.fade-in-element,
.entry-fade-element {
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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

.duration-600 {
  transition-duration: 0.6s;
}

.ease-out {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
