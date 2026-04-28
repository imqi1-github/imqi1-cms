<script setup lang="ts">
const loading = ref(true);
const sitemapData = ref<any>(null);
const recentComments = ref<any[]>([]);

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");

async function fetchSitemap() {
  loading.value = true;
  try {
    const [sitemapRes, commentsRes] = await Promise.all([
      $fetch("/api/sitemap") as Promise<any>,
      $fetch("/api/recent-comments?limit=10") as Promise<any>,
    ]);
    sitemapData.value = sitemapRes.data;
    recentComments.value = commentsRes.data || [];
  } catch (error) {
    console.error("获取站点地图失败:", error);
  } finally {
    loading.value = false;
  }
}

function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(date: string | Date): string {
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

onMounted(() => {
  fetchSitemap();
});

useHead({
  title: computed(() => `站点地图 - ${siteName.value}`)
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0a0a]">
    <div class="mx-auto max-w-4xl  animate-fade-in">
      <!-- 标题 -->
      <header class="mb-12 text-center">
        <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">站点地图</h1>
        <p class="text-slate-500 dark:text-gray-400 text-sm">浏览本站所有内容</p>
      </header>

      <!-- 加载状态 -->
      <div v-if="loading" class="space-y-8">
        <div v-for="i in 3" :key="i" class="animate-pulse">
          <div class="h-6 bg-slate-200 dark:bg-gray-800 rounded w-32 mb-4"></div>
          <div class="space-y-2">
            <div v-for="j in 5" :key="j" class="h-4 bg-slate-100 dark:bg-gray-900 rounded"></div>
          </div>
        </div>
      </div>

      <!-- 站点地图内容 -->
      <div v-else-if="sitemapData" class="space-y-12">
        <!-- 系统页面 -->
        <section>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">系统页面</h2>
          <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <li>
              <NuxtLink to="/" class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                首页
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/changelog"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                更新日志
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/subscribes"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                我的订阅
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/feed"
                target="_blank"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                本站RSS
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/links"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                友情链接
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/message"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                留言
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/sitemap"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                站点地图
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/archiving"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                文章归档
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/sitemap.xml"
                target="_blank"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                站点地图XML
              </NuxtLink>
            </li>
            <li>
              <NuxtLink
                to="/search"
                class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                搜索
              </NuxtLink>
            </li>
          </ul>
        </section>

        <!-- 分类和文章 -->
        <section v-if="sitemapData.categories && sitemapData.categories.length > 0">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">分类文章</h2>

          <div class="space-y-8">
            <div v-for="category in sitemapData.categories" :key="category.mid" class="pl-4 border-l-2 border-slate-200 dark:border-gray-700">
              <!-- 分类标题 -->
              <div class="mb-3">
                <NuxtLink
                  :to="`/category/${category.slug}`"
                  class="text-lg font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                  {{ category.name }}
                </NuxtLink>
              </div>

              <!-- 文章列表 -->
              <ul v-if="category.posts.length > 0" class="space-y-1.5 ml-4">
                <li v-for="post in category.posts" :key="post.cid">
                  <NuxtLink
                    :to="`/content/${category.slug}/${post.slug || post.cid}`"
                    class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm inline-block">
                    {{ post.title }}
                  </NuxtLink>
                  <span class="text-xs text-slate-400 dark:text-gray-500 ml-2">{{ formatDate(post.create_time) }}</span>
                </li>
              </ul>

              <!-- 无文章提示 -->
              <div v-else class="text-slate-400 dark:text-gray-500 text-sm ml-4">暂无文章</div>
            </div>
          </div>
        </section>

        <!-- 最近评论 -->
        <section v-if="recentComments && recentComments.length > 0" class="mb-12">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">最近评论</h2>
          <div class="space-y-4">
            <NuxtLink
              v-for="comment in recentComments"
              :key="comment.coid"
              :to="comment.post ? `${comment.post.url}#comment-${comment.coid}` : '#'"
              class="block pl-4 border-l-2 border-slate-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors group"
              :class="{ 'pointer-events-none opacity-50': !comment.post }">
              <div class="mb-2">
                <span class="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {{ comment.author }}
                </span>
                <span class="text-sm text-slate-500 dark:text-gray-400 ml-2">• {{ formatDateTime(comment.created) }}</span>
              </div>

              <div class="ml-4 space-y-2">
                <p class="text-slate-700 dark:text-gray-300 text-sm mb-1">{{ comment.text }}</p>
                <div v-if="comment.post" class="flex items-center gap-1 text-sm text-slate-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  <Icon name="ri-article-line" class="size-4" />
                  <span>{{ comment.post.title }}</span>
                  <Icon name="ri-external-link-line" class="size-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>

        <!-- 空状态 -->
        <div v-if="!sitemapData.categories || sitemapData.categories.length === 0" class="text-center py-12">
          <p class="text-slate-500 dark:text-gray-400">暂无分类</p>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else class="text-center py-12">
        <p class="text-slate-500 dark:text-gray-400">加载失败，请稍后重试</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 渐入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(20px);
  animation: fade-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes fade-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
