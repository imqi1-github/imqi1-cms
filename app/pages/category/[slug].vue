<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { siteConfig } from "~~/site.config";

const route = useRoute();
const router = useRouter();
// slug 必须是 computed：SPA 下 /category/A → /category/B 会复用本组件（setup 不重跑），
// 若在 setup 顶层一次性解构，slug 会停留在旧值，useFetch 不重新请求、路由守卫也判断错误。
const slug = computed(() => route.params.slug as string);

// useFetch 不能直接追踪 route.params.slug：SPA 导航到文章页 /content/{cat}/{文章slug} 时，
// route.params.slug 会变成文章 slug（Typecho 迁移文章常为纯数字 cid），分类页组件在页面过渡
// 卸载前仍存活，useFetch 会自动用文章 slug 重新请求 /api/category/{文章slug}/contents → 404 噪音。
// 用本地 ref 锁定，仅在路由仍在分类页时同步 slug。
const apiSlug = ref(slug.value);
watch(slug, value => {
  if (route.path.startsWith("/category/")) apiSlug.value = value;
});

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const photoCategorySlug = computed(() => siteSettings.value?.photoCategorySlug || "shot");
const contentPageSize = computed(() => siteSettings.value?.contentPageSize || 12);

// 从 URL query 参数中获取页码
const initialPage = route.query.page ? parseInt(route.query.page as string) : 1;
const page = ref(initialPage > 0 ? initialPage : 1);

// 获取分类文章数据
// URL/watch 基于 apiSlug（仅分类页内同步）：切分类时重新请求，SPA 导航离开文章页时不再误请求
const { data, pending, error } = await useFetch(() => `/api/category/${apiSlug.value}/contents`, {
  headers: getInternalRequestHeaders(),
  query: { page, pageSize: contentPageSize },
  watch: [page, apiSlug],
});

const category = computed(() => data.value?.data?.category);
const contents = computed(() => data.value?.data?.contents || []);
const pagination = computed(() => data.value?.data?.pagination);

// 判断是否为图片分类
const isPhotoCategory = computed(() => slug.value === photoCategorySlug.value);

// 将 contents 转换为瀑布流组件需要的格式（平铺所有封面）
const waterfallItems = computed(() => {
  const items: { url: string; title: string; desc?: string; width?: number | null; height?: number | null; cid?: number; slug: string; categorySlug: string }[] = [];
  contents.value.forEach(content => {
    const contentSlug = content.slug;
    if (content.covers && content.covers.length > 0 && contentSlug) {
      content.covers.forEach(cover => {
        items.push({
          url: cover.url,
          title: content.title,
          desc: cover.desc,
          width: cover.width,
          height: cover.height,
          cid: content.cid,
          slug: contentSlug,
          categorySlug: slug.value,
        });
      });
    }
  });
  return items;
});

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!category.value || error.value));

// 分类不存在时让 SSR 返回 404（后端 API 已抛 404，但页面需显式设置状态码，否则 SSR 返 200 形成 soft-404）
if (import.meta.server) {
  const event = useRequestEvent();
  if (event && isNotFound.value) setResponseStatus(event, 404);
}

// 骨架屏显示状态
const showSkeleton = ref(false);
const isPaginating = ref(false);
const hasPlayedEntryFade = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

// 生成图片分类翻页骨架屏随机高度 - 模拟真实瀑布流的随机效果
const photoSkeletonHeights = ref<number[]>([]);
const skeletonHeights = [200, 240, 280, 220, 260, 230, 270, 250, 210, 290, 215, 265, 235, 275, 225, 285];
function refreshPhotoSkeletonHeights() {
  photoSkeletonHeights.value = Array.from(
    { length: skeletonCount.value },
    () => 200 + Math.round(Math.random() * 110),
  );
}
function getSkeletonHeight(index: number): number {
  return photoSkeletonHeights.value[index - 1] ?? skeletonHeights[(index - 1) % skeletonHeights.length] ?? 240;
}

// 骨架屏数量 - 根据分类类型动态调整
const skeletonCount = computed(() => {
  // 图片分类固定显示 16 个，数量保持原来的瀑布流加载密度
  if (isPhotoCategory.value) {
    return 16;
  }
  // 普通分类：如果已经有数据，使用当前文章数量；否则使用每页显示数量
  if (contents.value.length > 0) {
    return contents.value.length;
  }
  return contentPageSize.value || 12;
});

// 监听 pending，控制骨架屏显示
watch(pending, isLoading => {
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }

  if (isLoading) {
    // 首次进入图片分类不显示骨架屏；翻页/页码切换时才显示骨架屏。
    if (isPaginating.value) {
      if (isPhotoCategory.value) {
        refreshPhotoSkeletonHeights();
      }
      showSkeleton.value = true;
    } else if (!isPhotoCategory.value && category.value) {
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
    path: `/category/${slug.value}`,
    query: { page: newPage.toString() },
  });
  page.value = newPage;
}

// 将所有渐入元素置为隐藏初始态：
// 普通元素 opacity-0 + translate-y-8；照片瀑布流（.photo-stream-fade）仅 opacity-0，
// 不对其高子树施加 transform，避免逐帧重绘
const hideFadeElements = (includeEntryFade = false) => {
  const selector = includeEntryFade ? ".fade-in-element, .entry-fade-element" : ".fade-in-element";

  document.querySelectorAll<HTMLElement>(selector).forEach(el => {
    el.classList.remove("opacity-100", "translate-y-0", "translate-y-8");
    el.classList.add("opacity-0");
    if (!el.classList.contains("photo-stream-fade")) {
      el.classList.add("translate-y-8");
    }
  });
};

// 触发渐入动画
function triggerFadeIn(includeEntryFade = false) {
  nextTick(() => {
    requestAnimationFrame(() => {
      const selector = includeEntryFade ? ".fade-in-element, .entry-fade-element" : ".fade-in-element";

      document.querySelectorAll<HTMLElement>(selector).forEach(el => {
        el.classList.remove("opacity-0", "translate-y-8");
        el.classList.add("opacity-100");
        // 照片瀑布流纯透明度淡入，不加 translate-y-0（避免对高子树做 transform 动画）
        if (!el.classList.contains("photo-stream-fade")) {
          el.classList.add("translate-y-0");
        }
      });
    });
  });
}

const triggerEntryFadeIn = () => {
  if (hasPlayedEntryFade.value) return;

  const entryElements = document.querySelectorAll<HTMLElement>(".entry-fade-element");
  if (!entryElements.length) return;

  hasPlayedEntryFade.value = true;
  hideFadeElements(true);
  triggerFadeIn(true);
};

// 监听数据加载状态，触发渐入渐出动画
watch(pending, (newVal, oldVal) => {
  // 数据加载完成，触发渐入动画
  if (oldVal && !newVal) {
    // 设置页面标题供导航栏使用
    if (category.value?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(category.value.name, "ri:menu-line");
    }

    // 强制触发渐入动画
    setTimeout(() => {
      const includeEntryFade = !hasPlayedEntryFade.value;

      // 对于图片分类，需要先重置状态再触发动画
      if (isPhotoCategory.value) {
        hideFadeElements(includeEntryFade);
        // 需要下一帧再触发动画，否则浏览器会合并DOM更新导致动画不播放
        requestAnimationFrame(() => {
          triggerFadeIn(includeEntryFade);
          hasPlayedEntryFade.value = true;
        });
      } else {
        triggerFadeIn(includeEntryFade);
        hasPlayedEntryFade.value = true;
      }
    }, 50);
  }

  // 开始加载新数据时，确保所有元素隐藏（只改变透明度）
  if (!oldVal && newVal && category.value) {
    hideFadeElements();
  }
});

// 监听路由变化，确保 URL 参数变化时也能正确更新
watch(
  () => route.query.page,
  newPage => {
    // 确保用户仍然在分类页面
    if (!route.path.startsWith(`/category/${slug.value}`)) {
      return;
    }

    const pageNum = newPage ? parseInt(newPage as string) : 1;
    if (pageNum > 0 && pageNum !== page.value) {
      isPaginating.value = true;
      page.value = pageNum;

      // 重置所有元素状态（只改变透明度）
      hideFadeElements();

      // 等待数据加载完成后触发动画
      setTimeout(() => {
        triggerFadeIn();
      }, 300);
    }
  },
);

// 监听路由变化，重新触发动画（切换到不同分类时）
watch(
  () => route.params.slug,
  async () => {
    // 确保用户仍然在分类页面
    if (!route.path.startsWith(`/category/${slug.value}`)) {
      return;
    }

    // 切换分类时回到第 1 页（避免沿用前一分类的页码导致空页或错位）
    page.value = 1;

    // 图片分类切换时不再显示整页骨架屏，避免瀑布流首屏额外渲染占位导致卡顿

    // 等待 DOM 更新
    await nextTick();

    // 等待浏览器渲染帧
    requestAnimationFrame(() => {
      // 先重置所有元素状态为初始状态
      hideFadeElements();

      if (!isPhotoCategory.value) {
        triggerFadeIn();
      }
    });
  },
);

// 监听分类数据变化，设置标题
watch(
  category,
  newCategory => {
    if (newCategory?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(newCategory.name, "ri:menu-line");
    }
  },
  { immediate: true },
);

// 页面标题
usePageSeo({
  title: computed(() => {
    if (pending.value) return `加载中... - ${siteName.value}`;
    if (isNotFound.value) return `分类不存在 - ${siteName.value}`;
    return `分类 ${category.value?.name} - ${siteName.value}`;
  }),
  description: computed(() => (category.value ? siteConfig.pageSeo.category.description(category.value.name, category.value.desc ?? "") : "")),
  keywords: computed(() => (category.value ? siteConfig.pageSeo.category.keywords(category.value.name, category.value.desc ?? "") : "")),
});

// 初始化渐入动画
onMounted(() => {
  // 延迟触发，确保 DOM 完全渲染
  setTimeout(() => {
    triggerEntryFadeIn();
  }, 100);
});
</script>

<template>
  <ClientOnly>
    <div :class="['mx-auto', isPhotoCategory ? 'photo-category-shell max-w-[1800px] -mt-6' : 'max-w-225 flex flex-col justify-center items-center']">
      <!-- 加载中 - 仅首次加载时显示 -->
      <div v-if="pending && !category" class="py-20 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
        <p class="mt-2 text-slate-500">加载中...</p>
      </div>

      <!-- 404 -->
      <NotFound v-else-if="isNotFound" title="分类不存在" />

      <!-- 图片分类 - 瀑布流布局 -->
      <template v-else-if="isPhotoCategory">
        <nav
          v-if="pagination && pagination.totalPages > 1"
          aria-label="图片分页"
          class="photo-page-control entry-fade-element sticky top-[calc(100vh-3.4rem)] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 inline-grid grid-cols-[1.45rem_auto_1.45rem] items-center gap-0.5 w-max my-0 mb-2 p-[0.22rem] border border-slate-200/90 rounded-full bg-white/82 shadow-lg shadow-slate-900/8 backdrop-blur-xl max-md:top-[calc(100vh-3rem)] max-md:bottom-4 max-md:left-4 max-md:ml-3 opacity-0 translate-y-8 duration-600 ease-out">
          <button
            type="button"
            :disabled="pagination.page <= 1 || pending"
            class="inline-flex items-center justify-center w-6 h-6 cursor-pointer rounded-full text-slate-500 bg-transparent hover:bg-gray-200 hover:text-slate-500 disabled:text-slate-300 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 transition-colors duration-300"
            @click="goToPage(pagination.page - 1)">
            <Icon name="ri-arrow-left-double-line" />
          </button>
          <span class="photo-page-current inline-flex items-baseline justify-center min-w-10 px-1 leading-1 whitespace-nowrap">
            <strong class="text-slate-900 text-[0.92rem] font-extrabold tracking-tighter">{{ pagination.page }}</strong>
            <em class="text-slate-400 text-[0.62rem] font-bold not-italic ml-1">/{{ pagination.totalPages }}</em>
          </span>
          <button
            type="button"
            :disabled="pagination.page >= pagination.totalPages || pending"
            class="inline-flex items-center justify-center w-6 h-6 cursor-pointer rounded-full text-slate-500 bg-transparent hover:bg-gray-200 hover:text-slate-500 disabled:text-slate-300 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 transition-colors duration-300"
            @click="goToPage(pagination.page + 1)">
            <Icon name="ri-arrow-right-double-line" />
          </button>
        </nav>

        <!-- 图片分类翻页骨架屏：首次进入不显示，仅页码切换/翻页加载时显示 -->
        <div
          v-if="showSkeleton"
          class="w-full columns-1 min-[465px]:columns-2 md:columns-3 lg:columns-4 gap-1.5">
          <div
            v-for="i in skeletonCount"
            :key="`skeleton-${i}`"
            class="block mb-2.5 overflow-hidden relative rounded-lg bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm"
            :style="{
              minHeight: getSkeletonHeight(i) + 'px',
            }">
            <div
              class="w-full h-full bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30 animate-pulse"
              :style="{ minHeight: getSkeletonHeight(i) + 'px' }"/>
          </div>
        </div>

        <!-- 图片列表：照片分类首次进入直接渲染图片流，依赖图片宽高占位，避免整页骨架屏卡顿 -->
        <div
          v-else-if="contents.length > 0"
          class="fade-in-element duration-600 ease-out opacity-0"
          :class="isPhotoCategory ? 'photo-stream-fade' : 'translate-y-8'">
          <WaterfallGrid :items="waterfallItems" />
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">暂无文章</div>
      </template>

      <!-- 普通分类 - 网格布局 -->
      <template v-else>
        <!-- 标题 -->
        <header class="my-12 entry-fade-element opacity-0 translate-y-8 duration-600 ease-out">
          <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
            <Icon name="ri:menu-line" class="inline-block size-12 mr-2" />{{ category?.name }}
          </h1>
          <p v-if="category?.desc" class="text-slate-600 dark:text-slate-400 mt-2">{{ category.desc }}</p>
        </header>

        <!-- 文章列表 -->
        <div
          v-if="contents.length > 0 && !showSkeleton"
          class="articles-grid grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <div
            v-for="content in contents"
            :key="content.cid"
            class="relative flex flex-col h-70 max-md:h-65 overflow-hidden rounded-[15px] shadow-sm hover:shadow-md border border-slate-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 group transition-all duration-300">
            <!-- 封面占满整卡 -->
            <NuxtLink
              v-if="content.covers.length > 0"
              :to="`/content/${slug}/${content.slug}`"
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
                :to="`/content/${slug}/${content.slug}`"
                class="text-[1.5em] font-extrabold my-1 block transition-colors"
                :class="content.covers.length > 0 ? 'text-white hover:text-blue-100' : 'text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-500'">
                {{ content.title }}
              </NuxtLink>

              <div
                class="text-xs my-1 flex flex-wrap gap-2"
                :class="content.covers.length > 0 ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'">
                <span v-tooltip="`最后更新时间`" class="flex items-center">
                  <Icon name="ri-time-line" class="size-4" />
                  {{ formatDate(content.updated) }}
                </span>
                <span v-if="content.tags.length > 0" class="flex items-center flex-wrap">
                  <Icon name="ri-hashtag" class="size-4" />
                  <NuxtLink
                    v-for="(tag, index) in content.tags"
                    :key="index"
                    v-tooltip="`标签`"
                    :to="tag.slug ? `/tag/${tag.slug}` : '#'"
                    class="mr-1 transition-colors"
                    :class="[
                      content.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400',
                      tag.slug ? 'cursor-pointer' : 'cursor-default opacity-60',
                    ]">
                    {{ tag.name }}
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
      <div v-if="!isPhotoCategory && pagination && pagination.totalPages > 1" class="entry-fade-element flex justify-center gap-2 mt-10 opacity-0 translate-y-8 duration-600 ease-out">
        <button
          v-if="pagination.page > 1"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          @click="goToPage(pagination.page - 1)">
          <Icon name="ri-arrow-left-double-line" />
        </button>

        <span class="px-4 py-2 text-slate-600 dark:text-slate-400"> 第 {{ pagination.page }} / {{ pagination.totalPages }} 页 </span>

        <button
          v-if="pagination.page < pagination.totalPages"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          @click="goToPage(pagination.page + 1)">
          <Icon name="ri-arrow-right-double-line" />
        </button>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* 渐入动画 - JS 通过 .fade-in-element/.entry-fade-element 选择器操作，必须保留 */
.fade-in-element,
.entry-fade-element {
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 照片分类瀑布流淡入：仅透明度，提升到合成层让动画走 compositor 而非主线程逐帧重绘高子树 */
.photo-stream-fade {
  will-change: opacity;
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
