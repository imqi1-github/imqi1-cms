<script setup lang="ts">
import { siteConfig } from "~~/site.config";

// 顶层 await useFetch：数据在挂载前（旧页面渐出期间）就绪，配合 Suspense 让旧页面完整渐出，
// 渐入时直接带数据。服务端渲染时通过内部请求 header 放行 referer-check（与其它页面一致）。
const ssrHeaders = { headers: getInternalRequestHeaders() };
const { data: sitemapRes, pending: sitemapPending } = await useFetch("/api/sitemap", ssrHeaders);
const { data: commentsRes } = await useFetch("/api/recent-comments?limit=10", ssrHeaders);
const { data: tagsRes } = await useFetch("/api/tags", ssrHeaders);

const sitemapData = computed(() => sitemapRes.value?.data ?? null);
const recentComments = computed(() => commentsRes.value?.data || []);
const tags = computed(() => tagsRes.value?.data || []);
const loading = computed(() => sitemapPending.value);

// 系统页面配置（包含图标、路径、名称）
const systemPages = [
  { path: "/", name: "首页", icon: "ri:home-line" },
  { path: "/about", name: "关于", icon: "ri:user-line" },
  { path: "/changelogs", name: "更新日志", icon: "ri:time-line" },
  { path: "/subscribes", name: "我的订阅", icon: "ri:rss-line" },
  { path: "/feed", name: "本站RSS", icon: "ri:rss-fill", external: true },
  { path: "/agreement", name: "协议", icon: "ri:file-text-line" },
  { path: "/links", name: "友情链接", icon: "ri:links-line" },
  { path: "/map", name: "地图", icon: "ri:map-2-line" },
  { path: "/messages", name: "留言", icon: "ri:chat-3-line" },
  { path: "/sitemap", name: "站点地图", icon: "ri:map-line" },
  { path: "/archiving", name: "文章归档", icon: "ri:archive-line" },
  { path: "/sitemap.xml", name: "站点地图XML", icon: "ri:file-code-line", external: true },
  { path: "/search", name: "搜索", icon: "ri:search-line" },
];

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 水合完成前，相对时间（基于 now）在服务端与客户端会算出不同文本，导致 hydration mismatch；
// 用 isHydrated 门控：水合前一律输出稳定的绝对日期，水合后再切换为「x分钟前」
const isHydrated = ref(false);
onMounted(() => {
  isHydrated.value = true;
});

// 绝对日期用 UTC 口径，保证 SSR 与客户端首屏一致（与归档/详情页对齐）
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // 水合前返回绝对日期，避免服务端/客户端相对时间不一致
  if (!isHydrated.value) {
    return formatDate(d);
  }
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

usePageSeo({
  title: computed(() => `站点地图 - ${siteName.value}`),
  description: siteConfig.pageSeo.sitemap.description,
  keywords: siteConfig.pageSeo.sitemap.keywords,
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0a0a]">
    <div v-scroll-reveal class="mx-auto max-w-4xl">
      <!-- 标题 -->
      <header class="mb-12 text-center">
        <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">站点地图</h1>
        <p class="text-slate-500 dark:text-gray-400 text-sm">浏览本站所有内容</p>
      </header>

      <!-- 加载状态 -->
      <div v-if="loading" class="space-y-8">
        <div v-for="i in 3" :key="i" class="animate-pulse">
          <div class="h-6 bg-slate-200 dark:bg-gray-800 rounded w-32 mb-4"/>
          <div class="space-y-2">
            <div v-for="j in 5" :key="j" class="h-4 bg-slate-100 dark:bg-gray-900 rounded"/>
          </div>
        </div>
      </div>

      <!-- 站点地图内容 -->
      <div v-else-if="sitemapData" class="space-y-12">
        <!-- 系统页面 -->
        <section>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">系统页面</h2>
          <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <li v-for="page in systemPages" :key="page.path">
              <NuxtLink
                :to="page.path"
                :target="page.external ? '_blank' : undefined"
                class="flex items-center gap-2 text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Icon :name="page.icon" class="size-4" />
                {{ page.name }}
                <Icon v-if="page.external" name="ri:external-link-line" class="size-3 opacity-60 align-sub" />
              </NuxtLink>
            </li>
          </ul>
        </section>

        <!-- 所有标签 -->
        <section v-if="tags.length > 0">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">文章标签</h2>
          <div class="flex flex-wrap gap-2">
            <NuxtLink
              v-for="tag in tags"
              :key="tag.slug ?? tag.name"
              :to="tag.slug ? `/tag/${tag.slug}` : '#'"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              :class="{ 'pointer-events-none opacity-50': !tag.slug }">
              <Icon name="ri:price-tag-3-line" class="size-3.5 align-sub" />
              {{ tag.name }}
            </NuxtLink>
          </div>
        </section>

        <!-- 分类和文章 -->
        <section v-if="sitemapData.categories && sitemapData.categories.length > 0">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-200 dark:border-gray-700">分类文章</h2>

          <div class="space-y-8">
            <div v-for="category in sitemapData.categories" :key="category.mid" class="pl-4 border-l-2 border-slate-200 dark:border-gray-700">
              <!-- 分类标题 -->
              <div class="mb-3">
                <NuxtLink
                  v-if="category.slug"
                  :to="`/category/${category.slug}`"
                  class="text-lg font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block">
                  {{ category.name }}
                </NuxtLink>
                <span v-else class="text-lg font-semibold text-slate-900 dark:text-white inline-block">
                  {{ category.name }}
                </span>
              </div>

              <!-- 文章列表 -->
              <ul v-if="category.contents.length > 0" class="space-y-1.5 ml-4">
                <li v-for="content in category.contents" :key="content.cid">
                  <NuxtLink
                    v-if="content.slug && category.slug"
                    :to="`/content/${category.slug}/${content.slug}`"
                    class="text-slate-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm inline-block">
                    {{ content.title }}
                  </NuxtLink>
                  <span v-else class="text-slate-700 dark:text-gray-300 text-sm inline-block">
                    {{ content.title }}
                  </span>
                  <span class="text-xs text-slate-400 dark:text-gray-500 ml-2">{{ formatDate(content.create_time) }}</span>
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
              :to="comment.contents ? `${comment.contents.url}#comment-${comment.coid}` : '#'"
              class="block pl-4 border-l-2 border-slate-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors group"
              :class="{ 'pointer-events-none opacity-50': !comment.contents }">
              <div class="mb-2">
                <span class="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {{ comment.author }}
                </span>
                <span class="text-sm text-slate-500 dark:text-gray-400 ml-2">• {{ formatDateTime(comment.created) }}</span>
              </div>

              <div class="ml-4 space-y-2">
                <p class="text-slate-700 dark:text-gray-300 text-sm mb-1"><EmojiParser :content="comment.text" size="sm" /></p>
                <div v-if="comment.contents" class="flex items-center gap-1 text-sm text-slate-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  <Icon name="ri-article-line" class="size-4" />
                  <span>{{ comment.contents.title }}</span>
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
