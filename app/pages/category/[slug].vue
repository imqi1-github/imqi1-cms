<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { siteConfig } from "~~/site.config";

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const photoCategorySlug = computed(() => siteSettings.value?.photoCategorySlug || "shot");
const postPageSize = computed(() => siteSettings.value?.postPageSize || 12);

// 从 URL query 参数中获取页码
const initialPage = route.query.page ? parseInt(route.query.page as string) : 1;
const page = ref(initialPage > 0 ? initialPage : 1);

// 获取分类文章数据
const { data, pending, error } = await useFetch(`/api/category/${slug}/posts`, {
  headers: {
    "x-ssr-internal-request": "true",
  },
  query: { page, pageSize: postPageSize },
  watch: [page],
});

const category = computed(() => data.value?.data?.category);
const posts = computed(() => data.value?.data?.posts || []);
const pagination = computed(() => data.value?.data?.pagination);

// 获取所有标签用于构建 slug 映射
const { data: tagsData } = await useFetch("/api/tags", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});
const tagSlugMap = computed(() => {
  const map = new Map<string, string>();
  if (tagsData.value?.data) {
    tagsData.value.data.forEach(tag => {
      map.set(tag.name, tag.slug ?? "");
    });
  }
  return map;
});

// 判断是否为图片分类
const isPhotoCategory = computed(() => slug === photoCategorySlug.value);

// 将 posts 转换为瀑布流组件需要的格式（平铺所有封面）
const waterfallItems = computed(() => {
  const items: { url: string; title: string; desc?: string; cid?: number; slug: string; categorySlug: string }[] = [];
  posts.value.forEach(post => {
    const postSlug = post.slug;
    if (post.covers && post.covers.length > 0 && postSlug) {
      post.covers.forEach(cover => {
        items.push({
          url: cover.url,
          title: post.title,
          desc: cover.desc,
          cid: post.cid,
          slug: postSlug,
          categorySlug: slug,
        });
      });
    }
  });
  return items;
});

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!category.value || error.value));

// 骨架屏显示状态
const showSkeleton = ref(false);
const isPaginating = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

// 生成骨架屏随机高度 - 模拟真实瀑布流的随机效果
const skeletonHeights = [200, 240, 280, 220, 260, 230, 270, 250, 210, 290, 215, 265, 235, 275, 225, 285];
function getSkeletonHeight(index: number): number {
  return skeletonHeights[(index - 1) % skeletonHeights.length] ?? 240;
}

// 骨架屏数量 - 根据分类类型动态调整
const skeletonCount = computed(() => {
  // 图片分类固定显示16个
  if (isPhotoCategory.value) {
    return 16;
  }
  // 普通分类：如果已经有数据，使用当前文章数量；否则使用每页显示数量
  if (posts.value.length > 0) {
    return posts.value.length;
  }
  return postPageSize.value || 12;
});

// 监听 pending，控制骨架屏显示
watch(pending, isLoading => {
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }

  if (isLoading) {
    // 图片分类：立即显示骨架屏
    // 普通分类：如果是翻页操作，立即显示；首次加载1秒后显示
    if (isPhotoCategory.value || isPaginating.value) {
      showSkeleton.value = true;
    } else if (category.value) {
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
    path: `/category/${slug}`,
    query: { page: newPage.toString() },
  });
  page.value = newPage;
}

// 触发渐入动画
function triggerFadeIn() {
  nextTick(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll(".fade-in-element").forEach(el => {
        el.classList.remove("opacity-0", "translate-y-8");
        el.classList.add("opacity-100", "translate-y-0");
      });
    });
  });
}

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
      // 对于图片分类，需要先重置状态再触发动画
      if (isPhotoCategory.value) {
        document.querySelectorAll(".fade-in-element").forEach(el => {
          el.classList.remove("opacity-100", "translate-y-0");
          el.classList.add("opacity-0", "translate-y-8");
        });
        // 需要下一帧再触发动画，否则浏览器会合并DOM更新导致动画不播放
        requestAnimationFrame(() => {
          triggerFadeIn();
        });
      } else {
        triggerFadeIn();
      }
    }, 50);
  }

  // 开始加载新数据时，确保所有元素隐藏（只改变透明度）
  if (!oldVal && newVal && category.value) {
    document.querySelectorAll(".fade-in-element").forEach(el => {
      el.classList.remove("opacity-100");
      el.classList.add("opacity-0");
    });
  }
});

// 监听路由变化，确保 URL 参数变化时也能正确更新
watch(
  () => route.query.page,
  newPage => {
    // 确保用户仍然在分类页面
    if (!route.path.startsWith(`/category/${slug}`)) {
      return;
    }

    const pageNum = newPage ? parseInt(newPage as string) : 1;
    if (pageNum > 0 && pageNum !== page.value) {
      page.value = pageNum;

      // 重置所有元素状态（只改变透明度）
      document.querySelectorAll(".fade-in-element").forEach(el => {
        el.classList.remove("opacity-100");
        el.classList.add("opacity-0");
      });

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
    if (!route.path.startsWith(`/category/${slug}`)) {
      return;
    }

    // 图片分类切换时立即显示骨架屏
    if (isPhotoCategory.value) {
      showSkeleton.value = true;
    }

    // 等待 DOM 更新
    await nextTick();

    // 等待浏览器渲染帧
    requestAnimationFrame(() => {
      // 先重置所有元素状态为初始状态
      document.querySelectorAll(".fade-in-element").forEach(el => {
        el.classList.remove("opacity-100", "translate-y-0");
        el.classList.add("opacity-0", "translate-y-8");
      });

      // 如果是图片分类且骨架屏正在显示，需要在数据加载完成后重新触发动画
      // 因为此时真实内容还没渲染，需要等到骨架屏隐藏后再处理
      if (!isPhotoCategory.value || !(showSkeleton.value || (pending.value && posts.value.length === 0))) {
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
    triggerFadeIn();
  }, 100);
});
</script>

<template>
  <ClientOnly>
    <div :class="['mx-auto', isPhotoCategory ? 'photo-category-shell' : 'max-w-225 flex flex-col justify-center items-center']">
      <!-- 加载中 - 仅首次加载时显示 -->
      <div v-if="pending && !category" class="py-20 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
        <p class="mt-2 text-slate-500">加载中...</p>
      </div>

      <!-- 404 -->
      <div
        v-else-if="isNotFound"
        class="text-center flex items-center justify-center flex-col py-20 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
        <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
          <Icon name="ri:close-large-fill" class="text-red-500" />
          <span>分类不存在</span>
        </h1>
        <p class="text-lg text-slate-600 dark:text-slate-400">
          未找到内容，你可以
          <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>。
        </p>
      </div>

      <!-- 图片分类 - 瀑布流布局 -->
      <template v-else-if="isPhotoCategory">
        <nav
          v-if="pagination && pagination.totalPages > 1"
          aria-label="图片分页"
          class="photo-page-control sticky top-[calc(100vh-3.4rem)] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 inline-grid grid-cols-[1.45rem_auto_1.45rem] items-center gap-0.5 w-max my-0 mb-2 p-[0.22rem] border border-slate-200/90 rounded-full bg-white/82 shadow-lg shadow-slate-900/8 backdrop-blur-xl max-md:top-[calc(100vh-3rem)] max-md:bottom-4 max-md:left-4 max-md:ml-3">
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

        <!-- 骨架屏（加载时显示16个占位符） -->
        <div
          v-if="showSkeleton || (pending && posts.length === 0)"
          class="2xl:columns-4 lg:max-2xl:columns-3 min-[640px]:max-lg:columns-2 max-[640px]:columns-1 gap-1.5 max-[640px]:gap-1 min-h-[180vh]">
          <div
            v-for="i in 16"
            :key="`skeleton-${i}`"
            class="block mb-2.5 overflow-hidden relative rounded-lg bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm"
            :style="{
              minHeight: getSkeletonHeight(i) + 'px',
            }">
            <!-- 图片占位 -->
            <div
              class="w-full h-full bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30 animate-pulse"
              :style="{ minHeight: getSkeletonHeight(i) + 'px' }"/>
          </div>
        </div>

        <!-- 图片列表 -->
        <div v-else-if="posts.length > 0" class="fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <WaterfallGrid :items="waterfallItems" />
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">暂无文章</div>
      </template>

      <!-- 普通分类 - 网格布局 -->
      <template v-else>
        <!-- 标题 -->
        <header class="my-12 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
            <Icon name="ri:menu-line" class="inline-block size-12 mr-2" />{{ category?.name }}
          </h1>
          <p v-if="category?.desc" class="text-slate-600 dark:text-slate-400 mt-2">{{ category.desc }}</p>
        </header>

        <!-- 文章列表 -->
        <div
          v-if="posts.length > 0 && !showSkeleton"
          class="articles-grid grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <div
            v-for="post in posts"
            :key="post.cid"
            class="flex flex-col rounded-[15px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm hover:shadow-md border border-transparent hover:border-blue-500 dark:hover:border-blue-600 group transition-all duration-300">
            <!-- 封面 -->
            <NuxtLink
              v-if="post.covers.length > 0"
              :to="`/content/${slug}/${post.slug}`"
              class="flex flex-col relative h-50 max-md:h-50 overflow-hidden rounded-t-[15px] grow">
              <img
                :src="post.covers[0]?.url"
                :alt="post.title"
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                loading="lazy" >
              <!-- 多封面角标 -->
              <div
                v-if="post.many_covers && post.covers.length > 1"
                class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                <Icon name="ri-gallery-line" class="size-3.5" />
                <span>+{{ post.covers.length - 1 }}</span>
              </div>
              <!-- 关联地点角标 -->
              <div
                v-if="post.travelCount > 0"
                :class="post.many_covers && post.covers.length > 1 ? 'top-10' : 'top-2'"
                class="absolute right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                <Icon name="ri:map-pin-line" class="size-3.5" />
                <span>{{ post.travelCount }}</span>
              </div>
            </NuxtLink>

            <!-- 无封面占位 -->
            <div
              v-else
              class="relative h-50 max-md:h-50 overflow-hidden rounded-t-[15px] bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
              <span class="text-slate-400 dark:text-gray-500 text-6xl">{{ post.title[0] }}</span>
            </div>

            <!-- 文章信息 -->
            <div class="px-5 pb-2 pt-1 mt-auto">
              <NuxtLink
                :to="`/content/${slug}/${post.slug}`"
                class="text-[1.5em] font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors my-1 block">
                {{ post.title }}
              </NuxtLink>

              <div class="text-xs text-slate-600 dark:text-slate-400 my-1 flex flex-wrap gap-2">
                <span v-tooltip="`最后更新时间`" class="flex items-center">
                  <Icon name="ri-time-line" class="size-4" />
                  {{ formatDate(post.updated) }}
                </span>
                <span v-if="post.tags.length > 0" v-tooltip="`标签`" class="flex items-center flex-wrap">
                  <Icon name="ri-hashtag" class="size-4" />
                  <NuxtLink
                    v-for="(tagName, index) in post.tags"
                    :key="index"
                    :to="`/tag/${tagSlugMap.get(tagName) || tagName}`"
                    class="hover:text-blue-600 dark:hover:text-blue-400 mr-1 transition-colors">
                    {{ tagName }}
                  </NuxtLink>
                </span>
                <span v-tooltip="`评论数量`" class="flex items-center">
                  <Icon name="ri-chat-2-line" class="size-4" />
                  {{ post.commentsNum > 0 ? post.commentsNum : "暂无评论" }}
                </span>
              </div>

              <p v-if="post.desc" class="text-[0.9em] text-slate-600 dark:text-slate-400 overflow-wrap break-word">
                {{ post.desc }}
              </p>
            </div>
          </div>
        </div>

        <!-- 骨架屏 -->
        <div v-else-if="showSkeleton" class="grid grid-cols-1 md:grid-cols-2 w-full gap-5">
          <div
            v-for="i in skeletonCount"
            :key="`skeleton-${i}`"
            class="flex flex-col h-75 overflow-hidden rounded-[15px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm">
            <!-- 封面骨架 -->
            <div
              class="h-50 max-md:h-50 bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30 animate-pulse rounded-t-[15px]"/>

            <!-- 文章信息骨架 -->
            <div class="px-5 pb-2 pt-1 mt-auto">
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
          v-else-if="posts.length === 0 && !pending"
          class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          暂无文章
        </div>
      </template>

      <!-- 分页 -->
      <div v-if="!isPhotoCategory && pagination && pagination.totalPages > 1" class="flex justify-center gap-2 mt-10">
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
/* 渐入动画 - JS 通过 .fade-in-element 选择器操作，必须保留 */
.fade-in-element {
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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
