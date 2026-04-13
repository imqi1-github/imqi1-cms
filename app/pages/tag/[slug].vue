<script setup lang="ts">
import { nextTick, onMounted, watch } from "vue";

const route = useRoute();
const slug = route.params.slug as string;

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");
const postPageSize = computed(() => siteData.value?.data?.postPageSize || 12);

// 获取标签文章数据
const page = ref(1);
const { data, pending, error, refresh } = await useFetch(`/api/tag/${slug}/posts`, {
  query: { page, pageSize: postPageSize },
  watch: [page],
});

const tag = computed(() => data.value?.data?.tag);
const posts = computed(() => data.value?.data?.posts || []);
const pagination = computed(() => data.value?.data?.pagination);

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!tag.value || error.value));

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
  // 先重置所有元素状态
  document.querySelectorAll(".fade-in-element").forEach(el => {
    el.classList.remove("opacity-100", "translate-y-0");
    el.classList.add("opacity-0", "translate-y-8");
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

// 监听数据加载完成，触发动画
watch(pending, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    // 设置页面标题供导航栏使用
    if (tag.value?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(`#${tag.value.name}`, "ri:hashtag");
    }
    triggerFadeIn();
  }
});

// 监听路由变化，重新触发动画
watch(
  () => route.params.slug,
  () => {
    // 先重置所有元素状态
    document.querySelectorAll(".fade-in-element").forEach(el => {
      el.classList.remove("opacity-100", "translate-y-0");
      el.classList.add("opacity-0", "translate-y-8");
    });
    triggerFadeIn();
  },
);

// 监听标签数据变化，设置标题
watch(
  tag,
  (newTag) => {
    if (newTag?.name) {
      const { setPageTitle } = usePageTitle();
      setPageTitle(`#${newTag.name}`, "ri:hashtag");
    }
  },
  { immediate: true }
);

// 页面标题
useHead({
  title: computed(() => {
    if (pending.value) return `加载中... - ${siteName.value}`;
    if (isNotFound.value) return `标签不存在 - ${siteName.value}`;
    return `${tag.value?.name} - ${siteName.value}`;
  }),
});

// 初始化渐入动画
onMounted(() => {
  triggerFadeIn();
});
</script>

<template>
  <div class="max-w-225 mx-auto px-5 py-8">
    <!-- 加载中 -->
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <!-- 404 -->
    <div
      v-else-if="isNotFound"
      class="text-center flex items-center justify-center flex-col py-20 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
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
      <header class="content-title-box title-no-cover mb-6 fade-in-element opacity-0 translate-y-8 duration-300 ease-out w-fit m-auto">
        <h1 class="content-title text-[3em] font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
          <Icon name="ri:hashtag" class="inline-block size-8.5 mr-2" />
          {{ tag?.name }}
        </h1>
        <p v-if="tag?.desc" class="content-description text-slate-600 dark:text-slate-400 mt-2">{{ tag.desc }}</p>
      </header>

      <!-- 文章列表 -->
      <div
        v-if="posts.length > 0"
        class="archive-articles grid grid-cols-1 md:grid-cols-2 w-full gap-5 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">
        <div
          v-for="post in posts"
          :key="post.cid"
          :class="[
            'archive-article rounded-15 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-sm hover:shadow-md transition-shadow',
            post.covers.length > 0 ? 'archive-has-cover' : 'archive-no-cover',
          ]">
          <!-- 封面 -->
          <NuxtLink
            v-if="post.covers.length > 0"
            :to="`/content/${post.categorySlug || 'uncategorized'}/${post.slug}`"
            class="relative h-70 overflow-hidden rounded-t-15">
            <img
              :src="post.covers[0].url"
              :alt="post.title"
              class="archive-article-cover absolute inset-0 w-full h-full object-cover"
              loading="lazy" />
          </NuxtLink>

          <!-- 文章信息 -->
          <div :class="['archive-article-box px-5 pb-2 pt-1 mt-auto', post.covers.length > 0 ? 'mt-auto' : '']">
            <NuxtLink
              :to="`/content/${post.categorySlug || 'uncategorized'}/${post.slug}`"
              class="archive-article-title text-[1.5em] font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors my-1 block">
              {{ post.title }}
            </NuxtLink>

            <div class="archive-article-info text-xs text-slate-600 dark:text-slate-400 my-1 flex flex-wrap gap-4">
              <span class="flex items-center" v-datatip="`最后更新时间`">
                <Icon name="ri-time-line" class="size-4" />
                {{ formatDate(post.updated) }}
              </span>
              <span v-if="post.categoryName" class="flex items-center" v-datatip="`分类`">
                <Icon name="ri:menu-line" class="size-4" />
                <NuxtLink
                  :to="`/category/${post.categorySlug}`"
                  class="hover:text-blue-600 dark:hover:text-blue-400 mr-1 transition-colors">
                  {{ post.categoryName }}
                </NuxtLink>
              </span>
              <span class="flex items-center" v-datatip="`评论数量`">
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

      <!-- 空状态 -->
      <div v-else class="text-center py-20 text-slate-500 fade-in-element opacity-0 translate-y-8 duration-300 ease-out">暂无文章</div>
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

.duration-300 {
  transition-duration: 0.6s;
}

.ease-out {
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* 文章卡片 */
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
