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
const postPageSize = computed(() => siteSettings.value?.postPageSize || 12);

// 从 URL query 参数中获取页码
const initialPage = route.query.page ? parseInt(route.query.page as string) : 1;
const page = ref(initialPage > 0 ? initialPage : 1);

// 获取标签文章数据
const { data, pending, error } = await useFetch(`/api/tag/${slug}/posts`, {
  headers: {
    "x-ssr-internal-request": "true",
  },
  query: { page, pageSize: postPageSize },
  watch: [page],
});

const tag = computed(() => data.value?.data?.tag);
const posts = computed(() => data.value?.data?.posts || []);
const pagination = computed(() => data.value?.data?.pagination);

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!tag.value || error.value));

// 骨架屏显示状态
const showSkeleton = ref(false);
const isPaginating = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

// 骨架屏数量 - 根据每页文章数量和当前页码动态调整
const skeletonCount = computed(() => {
  // 如果已经有数据，使用当前文章数量
  if (posts.value.length > 0) {
    return posts.value.length;
  }
  // 否则使用每页显示数量
  return postPageSize.value || 12;
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
    path: `/tag/${slug}`,
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
    if (tag.value?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(`${tag.value.name}`, "ri:hashtag");
    }

    // 强制触发渐入动画 - 给足够时间让DOM渲染完成
    setTimeout(() => {
      nextTick(() => {
        document.querySelectorAll(".fade-in-element").forEach(el => {
          el.classList.remove("opacity-100", "translate-y-0");
          el.classList.add("opacity-0", "translate-y-8");
        });
        // 需要下一帧再触发动画，否则浏览器会合并DOM更新导致动画不播放
        requestAnimationFrame(() => {
          triggerFadeIn();
        });
      });
    }, 150);
  }

  // 开始加载新数据时，确保所有元素隐藏（只改变透明度）
  if (!oldVal && newVal && tag.value) {
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
    // 确保用户仍然在标签页面
    if (!route.path.startsWith(`/tag/${slug}`)) {
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

// 监听路由变化，重新触发动画（切换到不同标签时）
watch(
  () => route.params.slug,
  async () => {
    // 确保用户仍然在标签页面
    if (!route.path.startsWith(`/tag/${slug}`)) {
      return;
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

      // 触发动画
      triggerFadeIn();
    });
  },
);

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
    if (isNotFound.value) return `标签不存在 - ${siteName.value}`;
    return `标签 ${tag.value?.name} - ${siteName.value}`;
  }),
  description: computed(() => (tag.value ? siteConfig.pageSeo.tag.description(tag.value.name) : "")),
  keywords: computed(() => (tag.value ? siteConfig.pageSeo.tag.keywords(tag.value.name) : "")),
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
    <div class="max-w-225 mx-auto">
      <!-- 加载中 - 仅首次加载时显示 -->
      <div v-if="pending && !tag" class="py-20 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
        <p class="mt-2 text-slate-500">加载中...</p>
      </div>

      <!-- 404 -->
      <div
        v-else-if="isNotFound"
        class="text-center flex items-center justify-center flex-col py-20 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
        <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
          <Icon name="ri:close-large-fill" class="text-red-500" />
          <span>标签不存在</span>
        </h1>
        <p class="text-lg text-slate-600 dark:text-slate-400">
          未找到内容，你可以
          <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>。
        </p>
      </div>

      <!-- 标签文章页 -->
      <template v-else>
        <!-- 标题 -->
        <header class="my-12 mx-auto w-fit fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
            <Icon name="ri:hashtag" class="inline-block size-8.5 mr-2" />
            {{ tag?.name }}
          </h1>
          <p v-if="tag?.desc" class="text-slate-600 dark:text-slate-400 mt-2">{{ tag.desc }}</p>
        </header>

        <!-- 文章列表 -->
        <div
          v-if="posts.length > 0 && !showSkeleton"
          class="grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-600 ease-out">
          <div
            v-for="post in posts"
            :key="post.cid"
            class="flex flex-col rounded-[15px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm hover:shadow-md border border-transparent hover:border-blue-500 dark:hover:border-blue-600 group transition-all duration-300">
            <!-- 封面 -->
            <NuxtLink
              v-if="post.covers.length > 0"
              :to="`/content/${post.categorySlug || 'uncategorized'}/${post.slug}`"
              class="flex flex-col relative h-50 overflow-hidden rounded-t-[15px] grow">
              <img
                :src="post.covers[0]?.url"
                :alt="post.title"
                class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
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
                :to="`/content/${post.categorySlug || 'uncategorized'}/${post.slug}`"
                class="text-[1.5em] font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors my-1 block">
                {{ post.title }}
              </NuxtLink>

              <div class="text-xs text-slate-600 dark:text-slate-400 my-1 flex flex-wrap gap-2">
                <span v-tooltip="`最后更新时间`" class="flex items-center">
                  <Icon name="ri-time-line" class="size-4" />
                  {{ formatDate(post.updated) }}
                </span>
                <span v-if="post.categoryName" v-tooltip="`分类`" class="flex items-center">
                  <Icon name="ri:menu-line" class="size-4" />
                  <NuxtLink :to="`/category/${post.categorySlug}`" class="hover:text-blue-600 dark:hover:text-blue-400 mr-1 transition-colors">
                    {{ post.categoryName }}
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
      <div v-if="pagination && pagination.totalPages > 1" class="flex justify-center gap-2 mt-10">
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
.fade-in-element {
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
