<script setup lang="ts">
import { onMounted } from "vue";

const route = useRoute();
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

// 获取文章数据
const { data, pending, error } = await useFetch(`/api/posts/${slug}`);

const post = computed(() => data.value?.data);
const categories = computed(() => post.value?.relations?.map(r => r.category) || []);
const covers = computed(() => post.value?.parsedCovers || []);
const tags = computed(() => post.value?.tags || []);

// 判断封面类型
const hasCover = computed(() => covers.value.length > 0);
const hasManyCovers = computed(() => post.value?.many_covers && covers.value.length > 1);
const firstCover = computed(() => covers.value[0]?.url || "");

// 页面元数据
useHead({
  title: computed(() => post.value?.title || "文章加载中..."),
});

// 初始化滚动渐入动画
onMounted(() => {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove("opacity-0", "translate-y-8");
        entry.target.classList.add("opacity-100", "translate-y-0");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".animate-fade-in").forEach(el => {
    fadeInObserver.observe(el);
  });
});
</script>

<template>
  <div class="max-w-[900px] mx-auto px-5 py-8">
    <div v-if="pending" class="py-20 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="mt-2 text-slate-500">加载中...</p>
    </div>

    <div v-else-if="error || !post" class="py-20 text-center">
      <Icon name="lucide:alert-circle" class="size-8 text-red-500 mx-auto mb-2" />
      <p class="text-red-500">文章不存在或加载失败</p>
    </div>

    <article v-else class="flex flex-col animate-fade-in opacity-0 translate-y-8 duration-600 ease-out">
      <!-- 标题区域 -->
      <header :class="['mb-5', !hasCover ? 'flex flex-col items-center' : '']">
        <!-- 多封面轮播 -->
        <CoverSwiper v-if="hasManyCovers" :covers="covers" class="animate-fade-in opacity-0 translate-y-8 duration-600 ease-out" />

        <!-- 单封面 -->
        <img
          v-else-if="hasCover"
          :src="firstCover"
          alt="封面"
          class="w-full h-auto max-h-37.5 object-cover border border-gray-200 mb-5 cursor-zoom-in animate-fade-in opacity-0 translate-y-8 duration-600 ease-out"
          loading="lazy" />

        <!-- 标题 -->
        <h1
          id="article-title"
          class="text-[3em] font-extrabold leading-tight mb-2.5 text-slate-900 dark:text-slate-100 break-words animate-fade-in opacity-0 translate-y-8 duration-600 ease-out delay-100">
          {{ post.title }}
        </h1>

        <!-- 描述/摘要 -->
        <div
          v-if="post.desc"
          class="text-[1.1em] text-slate-600 dark:text-slate-400 leading-relaxed mb-5 animate-fade-in opacity-0 translate-y-8 duration-600 ease-out delay-150">
          {{ post.desc }}
        </div>

        <!-- 元信息 -->
        <div
          class="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400 pt-2.5 animate-fade-in opacity-0 translate-y-8 duration-600 ease-out delay-200">
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
            <NuxtLink :to="`/category/${categories[0].slug}`" class="text-inherit no-underline transition-colors hover:text-blue-600">
              {{ categories[0].name }}
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

      <!-- 文章内容 -->
      <div class="mt-8 animate-fade-in opacity-0 translate-y-8 duration-600 ease-out delay-300">
        <MarkdownRenderer :content="post.content" />
      </div>

      <!-- 评论区 -->
      <section class="mt-10 animate-fade-in opacity-0 translate-y-8 duration-600 ease-out delay-300">
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

/* 正文样式 - 保持原有深度样式 */
.content-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 20px 0;
}

.content-body :deep(p) {
  line-height: 1.8;
  margin-bottom: 1em;
}

.content-body :deep(h2) {
  font-size: 1.8em;
  font-weight: 700;
  margin-top: 2em;
  margin-bottom: 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid rgb(226 232 240);
}

.dark .content-body :deep(h2) {
  border-bottom-color: rgb(30 41 59);
}

.content-body :deep(h3) {
  font-size: 1.4em;
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
}

.content-body :deep(ul),
.content-body :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 1em;
}

.content-body :deep(li) {
  margin-bottom: 0.5em;
}

.content-body :deep(code) {
  background: rgb(241 245 249);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.dark .content-body :deep(code) {
  background: rgb(30 41 59);
}

.content-body :deep(pre) {
  background: rgb(15 23 42);
  color: rgb(241 245 249);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 20px 0;
}

.content-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.content-body :deep(blockquote) {
  border-left: 4px solid rgb(37 99 235);
  background: rgb(241 245 249);
  padding: 12px 16px;
  margin: 20px 0;
  border-radius: 0 8px 8px 0;
}

.dark .content-body :deep(blockquote) {
  background: rgb(30 41 59);
}

.content-body :deep(a) {
  color: rgb(37 99 235);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.content-body :deep(a:hover) {
  color: rgb(29 78 216);
}

/* 响应式 */
@media (max-width: 768px) {
  .text-\[3em\] {
    font-size: 2em;
  }
}
</style>
