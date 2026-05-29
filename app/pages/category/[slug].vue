<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LivePhoto from "~/components/LivePhoto.vue";

const route = useRoute();
const router = useRouter();
const slug = route.params.slug as string;

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");
const photoCategorySlug = computed(() => siteSettings.value?.photoCategorySlug || "shot");
const postPageSize = computed(() => siteSettings.value?.postPageSize || 12);

// 从 URL query 参数中获取页码
const initialPage = route.query.page ? parseInt(route.query.page as string) : 1;
const page = ref(initialPage > 0 ? initialPage : 1);

// 获取分类文章数据
const { data, pending, error, refresh } = await useFetch(`/api/category/${slug}/posts`, {
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
    tagsData.value.data.forEach((tag: any) => {
      map.set(tag.name, tag.slug);
    });
  }
  return map;
});

// 判断是否为图片分类
const isPhotoCategory = computed(() => slug === photoCategorySlug.value);

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!category.value || error.value));

// 骨架屏显示状态
const showSkeleton = ref(false);
const isPaginating = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

// 生成骨架屏随机高度 - 模拟真实瀑布流的随机效果
const skeletonHeights = [200, 240, 280, 220, 260, 230, 270, 250, 210, 290, 215, 265, 235, 275, 225, 285];
function getSkeletonHeight(index: number): number {
  return skeletonHeights[(index - 1) % skeletonHeights.length];
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
watch(pending, (isLoading) => {
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
  if (oldVal === true && newVal === false) {
    // 设置页面标题供导航栏使用
    if (category.value?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(category.value.name, "ri:menu-line");
    }

    // 强制触发渐入动画
    setTimeout(() => {
      triggerFadeIn();
    }, 50);
  }

  // 开始加载新数据时，确保所有元素隐藏（只改变透明度）
  if (oldVal === false && newVal === true && category.value) {
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

      // 触发动画
      triggerFadeIn();
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
useHead(() => ({
  title: (() => {
    if (pending.value) return `加载中... - ${siteName.value}`;
    if (isNotFound.value) return `分类不存在 - ${siteName.value}`;
    return `${category.value?.name} - ${siteName.value}`;
  })(),
  meta: category.value
    ? [
        {
          name: "description",
          content: `浏览 ${category.value.name} 分类下的所有文章，${category.value.desc || "查看相关技术文章和教程"}`,
        },
        {
          name: "keywords",
          content: `${category.value.name},分类,博客,${category.value.desc || ""}`,
        },
        {
          property: "og:title",
          content: `${category.value.name} - ${siteName.value}`,
        },
        {
          property: "og:description",
          content: category.value.desc || `浏览 ${category.value.name} 分类下的所有文章`,
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          name: "twitter:title",
          content: `${category.value.name} - ${siteName.value}`,
        },
        {
          name: "twitter:description",
          content: category.value.desc || `浏览 ${category.value.name} 分类下的所有文章`,
        },
      ]
    : [],
}));

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
    <div :class="['mx-auto', isPhotoCategory ? 'photo-category-container' : 'max-w-225 flex flex-col justify-center items-center']">
      <!-- 加载中 - 仅首次加载时显示 -->
      <div v-if="pending && !category" class="py-20 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-slate-500">加载中...</p>
      </div>

      <!-- 404 -->
      <div
        v-else-if="isNotFound"
        class="text-center flex items-center justify-center flex-col py-20 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
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
        <!-- 骨架屏（加载时显示16个占位符） -->
        <div v-if="showSkeleton || (pending && posts.length === 0)" class="photos-container">
          <div
            v-for="i in 16"
            :key="`skeleton-${i}`"
            class="photo-item photo-skeleton"
            :style="{
              animationDelay: `${(i - 1) * 80}ms`,
              minHeight: getSkeletonHeight(i) + 'px'
            }">
            <!-- 图片占位 -->
            <div class="photo-skeleton-image w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30 skeleton-pulse" :style="{ minHeight: getSkeletonHeight(i) + 'px' }"></div>
          </div>
        </div>

        <!-- 图片列表 -->
        <div v-else-if="posts.length > 0" class="photos-container fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
          <template v-for="post in posts" :key="post.cid">
            <template v-for="(cover, index) in post.covers" :key="`${post.cid}-${index}`">
              <NuxtLink :to="`/content/${slug}/${post.slug}`" class="photo-item">
                <LivePhoto
                  :src="cover.url"
                  :alt="cover.desc && cover.desc.trim() ? `${cover.desc} - ${post.title}` : post.title"
                  class="w-full h-full object-cover" />
                <div class="photo-name">{{ cover.desc && cover.desc.trim() ? `${cover.desc} - ${post.title}` : post.title }}</div>
              </NuxtLink>
            </template>
          </template>
        </div>

        <!-- 空状态 -->
        <div v-else class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">暂无文章</div>
      </template>

      <!-- 普通分类 - 网格布局 -->
      <template v-else>
        <!-- 标题 -->
        <header class="content-title-box title-no-cover my-12 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
          <h1 class="content-title text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
            <Icon name="ri:menu-line" class="inline-block size-12 mr-2" />{{ category?.name }}
          </h1>
          <p v-if="category?.desc" class="content-description text-slate-600 dark:text-slate-400 mt-2">{{ category.desc }}</p>
        </header>

        <!-- 文章列表 -->
        <div
          v-if="posts.length > 0 && !showSkeleton"
          class="archive-articles grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
          <div
            v-for="post in posts"
            :key="post.cid"
            :class="[
              'archive-article rounded-15 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm hover:shadow-md group transition-shadow',
              post.covers.length > 0 ? 'archive-has-cover' : 'archive-no-cover',
            ]">
            <!-- 封面 -->
            <NuxtLink v-if="post.covers.length > 0" :to="`/content/${slug}/${post.slug}`" class="relative h-70 overflow-hidden rounded-t-15">
              <img
                :src="post.covers[0].url"
                :alt="post.title"
                class="archive-article-cover absolute inset-0 w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                loading="lazy" />
            </NuxtLink>

            <!-- 文章信息 -->
            <div :class="['archive-article-box px-5 pb-2 pt-1 mt-auto', post.covers.length > 0 ? 'mt-auto' : '']">
              <NuxtLink
                :to="`/content/${slug}/${post.slug}`"
                class="archive-article-title text-[1.5em] font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors my-1 block">
                {{ post.title }}
              </NuxtLink>

              <div class="archive-article-info text-xs text-slate-600 dark:text-slate-400 my-1 flex flex-wrap gap-2">
                <span class="flex items-center" v-tooltip="`最后更新时间`">
                  <Icon name="ri-time-line" class="size-4" />
                  {{ formatDate(post.updated) }}
                </span>
                <span v-if="post.tags.length > 0" class="flex items-center flex-wrap" v-tooltip="`标签`">
                  <Icon name="ri-hashtag" class="size-4" />
                  <NuxtLink
                    v-for="(tagName, index) in post.tags"
                    :key="index"
                    :to="`/tag/${tagSlugMap.get(tagName) || tagName}`"
                    class="hover:text-blue-600 dark:hover:text-blue-400 mr-1 transition-colors">
                    {{ tagName }}
                  </NuxtLink>
                </span>
                <span class="flex items-center" v-tooltip="`评论数量`">
                  <Icon name="ri-chat-2-line" class="size-4" />
                  {{ post.commentsNum > 0 ? post.commentsNum : "暂无评论" }}
                </span>
              </div>

              <p v-if="post.desc" class="archive-article-brief text-[0.9em] text-slate-600 dark:text-slate-400 overflow-wrap break-word">
                {{ post.desc }}
              </p>
            </div>
          </div>
        </div>

        <!-- 骨架屏 -->
        <div v-else-if="showSkeleton" class="archive-articles grid grid-cols-1 md:grid-cols-2 w-full gap-5">
          <div
            v-for="i in skeletonCount"
            :key="`skeleton-${i}`"
            class="archive-article archive-has-cover rounded-15 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm overflow-hidden">
            <!-- 封面骨架 -->
            <div class="h-70 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700/30 dark:to-slate-600/30 animate-pulse rounded-t-15"></div>

            <!-- 文章信息骨架 -->
            <div class="archive-article-box px-5 pb-2 pt-1 mt-auto">
              <!-- 标题骨架 -->
              <div class="h-6 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse my-1"></div>

              <!-- 信息骨架 -->
              <div class="flex items-center flex-wrap gap-2 my-1">
                <div class="h-3 w-16 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"></div>
                <div class="h-3 w-20 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"></div>
                <div class="h-3 w-16 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse"></div>
              </div>

              <!-- 描述骨架 -->
              <div class="h-3.5 bg-slate-100 dark:bg-slate-700/30 rounded animate-pulse overflow-wrap break-word"></div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="posts.length === 0 && !pending" class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">暂无文章</div>
      </template>

      <!-- 分页 -->
      <div v-if="pagination && pagination.totalPages > 1" class="flex justify-center gap-2 mt-10">
        <button
          v-if="pagination.page > 1"
          @click="goToPage(pagination.page - 1)"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          <Icon name="ri-arrow-left-double-line" />
        </button>

        <span class="px-4 py-2 text-slate-600 dark:text-slate-400"> 第 {{ pagination.page }} / {{ pagination.totalPages }} 页 </span>

        <button
          v-if="pagination.page < pagination.totalPages"
          @click="goToPage(pagination.page + 1)"
          class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          <Icon name="ri-arrow-right-double-line" />
        </button>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* 骨架屏脉冲动画 */
@keyframes skeletonPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.skeleton-pulse {
  animation: skeletonPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 图片分类骨架屏样式 */
.photo-skeleton {
  background-color: rgb(255 255 255 / 0.95);
  border-radius: 8px;
  display: block;
  margin-bottom: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  break-inside: avoid;
  backdrop-filter: blur(12px);
  min-height: 200px;
}

.dark .photo-skeleton {
  background-color: rgb(17 24 39 / 0.95);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.photo-skeleton-image {
  width: 100%;
  position: relative;
}

.photo-skeleton-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.1), transparent);
}

/* 图片分类容器 */
.photo-category-container {
  max-width: 1600px;
}

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

.duration-300 {
  transition-duration: 0.6s;
}

.ease-out {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* 图片分类 - 瀑布流布局 */
.photos-container {
  column-count: 4;
  column-gap: 12px;
}

@media (max-width: 1400px) {
  .photos-container {
    column-count: 3;
  }
}

@media (max-width: 1024px) {
  .photos-container {
    column-count: 2;
  }
}

@media (max-width: 640px) {
  .photos-container {
    column-count: 1;
  }
}

.photo-item {
  background-color: rgb(255 255 255 / 0.95);
  border-radius: 8px;
  display: block;
  margin-bottom: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  break-inside: avoid;
  backdrop-filter: blur(12px);
}

.dark .photo-item {
  background-color: rgb(17 24 39 / 0.95);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.photo-item:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}

.dark .photo-item:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
}

.photo-item img {
  /* aspect-ratio: 4/3; */
  display: block;
  width: 100%;
  height: auto;
  transition: transform 0.3s ease;
}

.photo-item:hover img {
  transform: scale(1.02);
}

.photo-name {
  font-size: 0.8em;
  padding: 8px 12px;
  text-align: center;
  text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.8);
  color: white;
  width: 100%;
  opacity: 0;
  transition: opacity 0.2s ease;
  position: absolute;
  bottom: 0;
  left: 0;
}

.photo-item:hover .photo-name {
  opacity: 1;
}

/* 普通分类 - 文章卡片 */
.archive-article {
  display: flex;
  flex-direction: column;
}

.rounded-15 {
  border-radius: 15px;
}

.h-70 {
  height: 280px;
}

.archive-has-cover {
  height: 280px;
  overflow: hidden;
}

.archive-has-cover .archive-article-box {
  margin-top: auto;
}

.rounded-t-15 {
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
}

.transition-shadow {
  transition: box-shadow 0.2s ease;
}

/* 响应式 */
@media (max-width: 768px) {
  .archive-articles {
    grid-template-columns: 1fr !important;
  }

  .h-70 {
    height: 200px;
  }

  .archive-has-cover {
    height: auto;
  }
}
</style>
