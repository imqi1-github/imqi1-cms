<script setup lang="ts">
const route = useRoute();
const slug = route.params.slug as string;

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");
const photoCategorySlug = computed(() => siteData.value?.data?.photoCategorySlug || "shot");

// 获取分类文章数据
const page = ref(1);
const { data, pending, error } = await useFetch(`/api/category/${slug}/posts`, {
  query: { page, pageSize: 12 },
});

const category = computed(() => data.value?.data?.category);
const posts = computed(() => data.value?.data?.posts || []);
const pagination = computed(() => data.value?.data?.pagination);

// 判断是否为图片分类
const isPhotoCategory = computed(() => slug === photoCategorySlug.value);

// 判断是否为404
const isNotFound = computed(() => !pending.value && (!category.value || error.value));

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

// 翻页
function goToPage(newPage: number) {
  page.value = newPage;
}

// 页面标题
useHead({
  title: computed(() => {
    if (pending.value) return `加载中... - ${siteName.value}`;
    if (isNotFound.value) return `分类不存在 - ${siteName.value}`;
    return `${category.value?.name} - ${siteName.value}`;
  }),
});
</script>

<template>
  <div :class="['mx-auto px-5 py-8', isPhotoCategory ? 'max-w-full' : 'max-w-225']">
    <!-- 加载中 -->
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <!-- 404 -->
    <div v-else-if="isNotFound" class="text-center flex items-center justify-center flex-col py-20">
      <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
        <Icon name="ri:close-large-fill" class="text-red-500" />
        <span>分类不存在</span>
      </h1>
      <p class="text-lg text-slate-600 dark:text-slate-400">
        未找到内容，你可以
        <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>
      </p>
    </div>

    <!-- 图片分类 - 瀑布流布局 -->
    <template v-else-if="isPhotoCategory">
      <!-- 标题 -->
      <header class="mb-6">
        <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-slate-100">{{ category?.name }}</h1>
        <p v-if="category?.desc" class="text-slate-600 dark:text-slate-400 mt-2">{{ category.desc }}</p>
      </header>

      <!-- 图片列表 -->
      <div v-if="posts.length > 0" class="photos-container">
        <template v-for="post in posts" :key="post.cid">
          <!-- 多封面 -->
          <template v-if="post.many_covers && post.covers.length > 0">
            <NuxtLink
              v-for="(cover, index) in post.covers"
              :key="`${post.cid}-${index}`"
              :to="`/content/${slug}/${post.slug}`"
              class="photo-item"
            >
              <img :src="cover.url" :alt="cover.desc || post.title" loading="lazy" />
              <div class="photo-name">{{ cover.desc || post.title }}</div>
            </NuxtLink>
          </template>
          <!-- 单封面 -->
          <NuxtLink v-else-if="post.covers.length > 0" :to="`/content/${slug}/${post.slug}`" class="photo-item">
            <img :src="post.covers[0].url" :alt="post.title" loading="lazy" />
            <div class="photo-name">{{ post.title }}</div>
          </NuxtLink>
        </template>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20 text-slate-500">
        暂无文章
      </div>
    </template>

    <!-- 普通分类 - 网格布局 -->
    <template v-else>
      <!-- 标题 -->
      <header class="content-title-box title-no-cover mb-6">
        <h1 class="content-title text-[3em] font-extrabold text-slate-900 dark:text-slate-100">{{ category?.name }}</h1>
        <p v-if="category?.desc" class="content-description text-slate-600 dark:text-slate-400 mt-2">{{ category.desc }}</p>
      </header>

      <!-- 文章列表 -->
      <div v-if="posts.length > 0" class="archive-articles grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          v-for="post in posts"
          :key="post.cid"
          :class="['archive-article rounded-15 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow', post.covers.length > 0 ? 'archive-has-cover' : 'archive-no-cover']"
        >
          <!-- 封面 -->
          <NuxtLink v-if="post.covers.length > 0" :to="`/content/${slug}/${post.slug}`" class="relative h-70 overflow-hidden rounded-t-15">
            <img
              :src="post.covers[0].url"
              :alt="post.title"
              class="archive-article-cover absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </NuxtLink>

          <!-- 文章信息 -->
          <div :class="['archive-article-box p-5 md:p-6', post.covers.length > 0 ? 'mt-auto' : '']">
            <NuxtLink :to="`/content/${slug}/${post.slug}`" class="archive-article-title text-[1.5em] font-extrabold text-slate-900 dark:text-slate-100 hover:text-blue-600 transition-colors my-3 block">
              {{ post.title }}
            </NuxtLink>

            <div class="archive-article-info text-xs text-slate-600 dark:text-slate-400 my-3 pb-3 flex flex-wrap gap-4">
              <span class="flex items-center gap-1" data-tip="最后更新时间">
                <Icon name="ri-time-line" class="size-4" />
                {{ formatDate(post.updated) }}
              </span>
              <span v-if="post.tags.length > 0" class="flex items-center gap-1" data-tip="标签">
                <Icon name="ri-price-tag-3-line" class="size-4" />
                {{ post.tags.join(' ') }}
              </span>
              <span class="flex items-center gap-1" data-tip="评论数量">
                <Icon name="ri-chat-2-line" class="size-4" />
                {{ post.commentsNum > 0 ? post.commentsNum : '暂无评论' }}
              </span>
            </div>

            <p v-if="post.desc" class="archive-article-brief text-[0.9em] text-slate-600 dark:text-slate-400 overflow-wrap break-word">
              {{ post.desc }}
            </p>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20 text-slate-500">
        暂无文章
      </div>
    </template>

    <!-- 分页 -->
    <div v-if="pagination && pagination.totalPages > 1" class="flex justify-center gap-2 mt-10">
      <button
        v-if="pagination.page > 1"
        @click="goToPage(pagination.page - 1)"
        class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <Icon name="ri-arrow-left-double-line" />
      </button>

      <span class="px-4 py-2 text-slate-600 dark:text-slate-400">
        第 {{ pagination.page }} / {{ pagination.totalPages }} 页
      </span>

      <button
        v-if="pagination.page < pagination.totalPages"
        @click="goToPage(pagination.page + 1)"
        class="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <Icon name="ri-arrow-right-double-line" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 图片分类 - 瀑布流布局 */
.photos-container {
  column-count: 3;
  column-gap: 10px;
}

@media (max-width: 768px) {
  .photos-container {
    column-count: 2;
  }
}

@media (max-width: 480px) {
  .photos-container {
    column-count: 1;
  }
}

.photo-item {
  background-color: white;
  border-radius: 8px;
  display: block;
  margin-bottom: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  break-inside: avoid;
}

.dark .photo-item {
  background-color: rgb(30 41 59);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.photo-item:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}

.dark .photo-item:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
}

.photo-item img {
  aspect-ratio: 4/3;
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
