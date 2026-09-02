<script setup lang="ts">
import { siteConfig } from "~~/site.config";
import type { SitemapPageItem } from "~/types/pages/sitemap";

// 顶层 await useFetch：数据在挂载前（旧页面渐出期间）就绪，配合 Suspense 让旧页面完整渐出，
// 渐入时直接带数据。服务端渲染时通过内部请求 header 放行 referer-check（与其它页面一致）。
const ssrHeaders = { headers: getInternalRequestHeaders() };
// 离场淡出：旧页在新页数据就绪前完整淡出（Suspense 挂起时长覆盖 fadeDuration），SSR/水合为 no-op
await useFadeOutOnNavigate();
// 四个请求彼此无数据依赖，串行会叠加每个 handler 的延迟放大 TTFB / SPA 等待；改 Promise.all 并行
const [sitemapFetch, commentsFetch, tagsFetch, statsFetch] = await Promise.all([
  useFetch("/api/sitemap", ssrHeaders),
  useFetch("/api/recent-comments?limit=10", ssrHeaders),
  useFetch("/api/tags", ssrHeaders),
  useFetch("/api/stats", ssrHeaders),
]);
const sitemapRes = sitemapFetch.data;
const sitemapPending = sitemapFetch.pending;
const commentsRes = commentsFetch.data;
const tagsRes = tagsFetch.data;
const statsRes = statsFetch.data;

const sitemapData = computed(() => sitemapRes.value?.data ?? null);
const recentComments = computed(() => commentsRes.value?.data || []);
const tags = computed(() => tagsRes.value?.data || []);
// 文章总数（用于「文章标签」分区概要），与关于页同源
const articlesCount = computed(() => statsRes.value?.data?.publishedContentsNum ?? 0);
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

// 合并「系统页面」与 CMS 独立页面（type=1），按目标路径去重——
// systemPages 优先，避免 agreement 这类同时存在于静态页与 CMS 的条目重复出现。
const mergedPages = computed(() => {
  const seen = new Set<string>();
  const result: SitemapPageItem[] = [];
  for (const page of systemPages) {
    if (seen.has(page.path)) continue;
    seen.add(page.path);
    result.push(page);
  }
  const pages = sitemapData.value?.pages ?? [];
  for (const page of pages) {
    if (!page.slug) continue;
    const path = `/${page.slug}`;
    if (seen.has(path)) continue;
    seen.add(path);
    result.push({ path, name: page.title, icon: "ri:article-line" });
  }
  return result;
});

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 水合完成前，相对时间（基于 now）在服务端与客户端会算出不同文本，导致 hydration mismatch；
// 用 isHydrated 门控：水合前一律输出稳定的绝对日期，水合后再切换为「x分钟前」
const isHydrated = ref(false);
onMounted(() => {
  isHydrated.value = true;
});

// 评论头像加载失败时回退为首字母（头像源与评论区一致，参见 recent-comments.get.ts）
const failedAvatars = ref<Set<number>>(new Set());
function markAvatarFailed(coid: number) {
  failedAvatars.value = new Set(failedAvatars.value).add(coid);
}

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
  <div class="max-w-5xl mx-auto">
    <!-- 标题 -->
    <header v-scroll-reveal class="mb-10">
      <h1 class="text-[3em] font-extrabold text-slate-900 dark:text-white mb-2.5">站点地图</h1>
      <p class="text-[0.95em] text-slate-600 dark:text-slate-400">浏览本站的全部内容与结构，快速到达任意角落。</p>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="space-y-8">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="h-7 bg-slate-200 dark:bg-gray-800 rounded w-40 mb-4" />
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div v-for="j in 6" :key="j" class="h-16 bg-slate-100 dark:bg-gray-900 rounded-2xl" />
        </div>
      </div>
    </div>

    <!-- 站点地图内容 -->
    <div v-else-if="sitemapData" class="space-y-10">
      <!-- 页面导航（系统页面 + CMS 独立页面，合并去重） -->
      <section v-if="mergedPages.length > 0" v-scroll-reveal>
        <div class="mb-5">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">页面导航</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">站点的功能页面与独立页面</p>
        </div>
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <li v-for="page in mergedPages" :key="page.path">
            <NuxtLink
              :to="page.path"
              :target="page.external ? '_blank' : undefined"
              class="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3 transition-all duration-300 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10">
              <div class="flex items-center justify-center size-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors duration-300 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-blue-500">
                <Icon :name="page.icon" class="size-5" />
              </div>
              <span class="font-medium text-slate-700 dark:text-slate-200 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">{{ page.name }}</span>
              <Icon v-if="page.external" name="ri:external-link-line" class="size-3.5 ml-auto text-slate-400 dark:text-slate-500 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <!-- 所有标签 -->
      <section v-if="tags.length > 0" v-scroll-reveal>
        <div class="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">文章标签</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">按主题快速检索文章</p>
          </div>
          <div class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3 py-1 text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <span class="font-bold text-slate-900 dark:text-white tabular-nums">{{ articlesCount }}</span>
            <span>篇文章</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="tag in tags"
            :key="tag.slug ?? tag.name"
            :to="tag.slug ? `/tag/${tag.slug}` : '#'"
            class="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 transition-all duration-300 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400"
            :class="{ 'pointer-events-none opacity-50': !tag.slug }">
            <Icon name="ri:price-tag-3-line" class="size-3.5" />
            {{ tag.name }}
            <span class="ml-0.5 text-xs tabular-nums text-slate-400 dark:text-slate-500 transition-colors duration-300 group-hover:text-blue-500 dark:group-hover:text-blue-300">{{ tag.count }}</span>
          </NuxtLink>
        </div>
      </section>

      <!-- 分类和文章 -->
      <section v-if="sitemapData.categories" v-scroll-reveal>
        <div class="mb-5">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">分类文章</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">按分类浏览最新文章</p>
        </div>

        <!-- 分类为空：仅在本分区内展示空态，避免与上方已有分区（页面/标签/评论）并存时视觉错位 -->
        <div v-if="sitemapData.categories.length === 0" class="text-center py-16">
          <Icon name="ri:folder-open-line" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p class="text-slate-500 dark:text-slate-400">暂无分类</p>
        </div>
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            v-for="(category, index) in sitemapData.categories"
            :key="category.slug || 'category-' + index"
            class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40 p-5 transition-colors duration-300">
            <!-- 分类标题 -->
            <div class="mb-4">
              <NuxtLink
                v-if="category.slug"
                :to="`/category/${category.slug}`"
                class="flex items-center gap-2 min-w-0 group">
                <div class="flex items-center justify-center size-8 rounded-lg bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 shrink-0">
                  <Icon name="ri:book-open-line" class="size-4" />
                </div>
                <span class="text-lg font-semibold text-slate-900 dark:text-white truncate transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {{ category.name }}
                </span>
              </NuxtLink>
              <span v-else class="flex items-center gap-2 min-w-0">
                <div class="flex items-center justify-center size-8 rounded-lg bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 shrink-0">
                  <Icon name="ri:book-open-line" class="size-4" />
                </div>
                <span class="text-lg font-semibold text-slate-900 dark:text-white truncate">{{ category.name }}</span>
              </span>
            </div>

            <!-- 文章列表 -->
            <ul v-if="category.contents.length > 0" class="space-y-0.5">
              <li v-for="content in category.contents" :key="content.cid">
                <NuxtLink
                  v-if="content.slug && category.slug"
                  :to="`/content/${category.slug}/${content.slug}`"
                  class="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <span class="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 transition-colors duration-200 group-hover:bg-blue-500 dark:group-hover:bg-blue-400" />
                  <span class="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-300 truncate transition-colors duration-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {{ content.title }}
                  </span>
                  <span class="shrink-0 text-xs text-slate-400 dark:text-slate-500 tabular-nums">{{ formatDate(content.create_time) }}</span>
                </NuxtLink>
                <div v-else class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 opacity-70">
                  <span class="size-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                  <span class="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-300 truncate">{{ content.title }}</span>
                  <span class="shrink-0 text-xs text-slate-400 dark:text-slate-500 tabular-nums">{{ formatDate(content.create_time) }}</span>
                </div>
              </li>
            </ul>

            <!-- 无文章提示 -->
            <div v-else class="text-sm text-slate-400 dark:text-slate-500 pl-0.5">暂无文章</div>

            <!-- 查看更多 -->
            <NuxtLink
              v-if="category.slug && category.contents.length > 0"
              :to="`/category/${category.slug}`"
              class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-400">
              查看全部
              <Icon name="ri:arrow-right-line" class="size-3.5" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- 最近评论 -->
      <section v-if="recentComments && recentComments.length > 0" v-scroll-reveal>
        <div class="mb-5">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">最近评论</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">站点最新的留言动态</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NuxtLink
            v-for="comment in recentComments"
            :key="comment.coid"
            :to="`${comment.contents.url}#comment-${comment.coid}`"
            class="group block rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/40 p-4 transition-all duration-300 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10">
            <div class="flex items-center gap-2 mb-2">
              <div class="flex items-center justify-center size-7 rounded-full shrink-0 overflow-hidden bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 text-xs font-bold">
                <img
                  v-if="comment.avatar && !failedAvatars.has(comment.coid)"
                  :src="comment.avatar"
                  :alt="comment.author"
                  loading="lazy"
                  class="no-img-loading w-full h-full object-cover"
                  @error="markAvatarFailed(comment.coid)">
                <template v-else>{{ (comment.author || "?").charAt(0).toUpperCase() }}</template>
              </div>
              <span class="font-semibold text-slate-900 dark:text-white truncate transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {{ comment.author }}
              </span>
              <span class="text-xs text-slate-400 dark:text-slate-500 shrink-0">• {{ formatDateTime(comment.created) }}</span>
            </div>

            <p class="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-2">
              <EmojiParser :content="comment.text" size="sm" />
            </p>

            <div class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <Icon name="ri:article-line" class="size-3.5 shrink-0" />
              <span class="truncate">{{ comment.contents.title }}</span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>

    <!-- 错误状态 -->
    <div v-else class="text-center py-16">
      <Icon name="ri:cloud-off-line" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <p class="text-slate-500 dark:text-slate-400">加载失败，请稍后重试</p>
    </div>
  </div>
</template>
