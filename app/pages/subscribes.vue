<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { siteConfig } from "~~/site.config";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const feedCacheInterval = computed(() => siteSettings.value?.feedCacheInterval || 8);

usePageSeo({
  title: computed(() => `我的订阅 - ${siteName.value}`),
  description: siteConfig.pageSeo.subscribes.description,
  keywords: siteConfig.pageSeo.subscribes.keywords,
});

// 顶层 await useFetch：数据在挂载前（旧页面渐出期间）就绪，配合 Suspense 让旧页面完整渐出，渐入时直接带数据。
// 订阅源列表含随机洗牌，故用 ref 并在 onMounted（仅客户端）计算，避免 SSR/客户端各洗一次导致 hydration 不一致。
// x-ssr-internal-request 头供 referer-check 中间件放行 SSR 内部请求（与其它页面一致）。
const { data: postsRes, pending, error: fetchError, refresh } = await useFetch("/api/subscribes", {
  headers: { "x-ssr-internal-request": "true" },
});
const posts = computed(() => ((postsRes.value as any)?.data || []) as any[]);
const error = computed<string | null>(() =>
  fetchError.value ? fetchError.value.message || "获取订阅文章失败" : null,
);
const isLoaded = computed(() => !pending.value);

// 获取当前选择的订阅源ID
const route = useRoute();
const selectedSourceId = computed(() => {
  const sourceId = route.query.source;
  return sourceId ? parseInt(sourceId as string) : null;
});

// 用于强制重新渲染动画的key
const animatinKey = ref(0);

// 左侧边栏引用
const sidebarRef = ref<HTMLElement | null>(null);

// 折叠菜单状态
const isExpanded = ref(false);

// 处理左侧边栏的滚轮事件
function handleSidebarWheel(event: WheelEvent) {
  if (sidebarRef.value && event.target instanceof Node && sidebarRef.value.contains(event.target)) {
    event.preventDefault();
    event.stopPropagation();

    const sidebar = sidebarRef.value;
    const delta = event.deltaY;
    sidebar.scrollTop += delta;
  }
}

// 切换折叠状态
function toggleExpanded(event?: MouseEvent) {
  (event?.currentTarget as HTMLElement | null)?.blur();
  isExpanded.value = !isExpanded.value;
}

// 显示的订阅源列表（折叠时最多4个，展开时显示全部）
const displayedSubscribes = computed(() => {
  if (isExpanded.value) {
    return subscribes.value;
  }
  return subscribes.value.slice(0, 4);
});

// 剩余订阅源数量
const remainingCount = computed(() => Math.max(0, subscribes.value.length - 4));

const expandTooltip = computed(() => ({
  content: `还有 ${remainingCount.value} 个订阅源`,
  triggers: ["hover"],
}));

const collapseTooltip = {
  content: "收起",
  triggers: ["hover"],
};

onMounted(() => {
  // 计算订阅源列表（含随机洗牌，仅客户端）
  computeSubscribes();

  // 添加滚轮事件监听
  if (import.meta.client) {
    window.addEventListener('wheel', handleSidebarWheel, { passive: false });
  }

  // 等待全局页面过渡完成后再初始化淡入动画
  nextTick(() => {
    setTimeout(() => {
      const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      };

      const fadeInObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("fade-in-start");
            fadeInObserver.unobserve(entry.target);
          }
        });
      }, observerOptions);

      document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
        fadeInObserver.observe(el);
      });
    }, siteConfig.pageTransition.fadeDuration); // 等待全局页面淡入完成
  });
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener('wheel', handleSidebarWheel);
  }
});

// 订阅源列表（含随机洗牌）。用 ref 而非 computed，并在 onMounted（仅客户端）计算，
// 避免 SSR 与客户端各自随机一次导致 hydration 不一致。
const subscribes = ref<any[]>([]);

function computeSubscribes() {
  const subscribeMap = new Map();
  posts.value.forEach(post => {
    if (!subscribeMap.has(post.subscribeId)) {
      subscribeMap.set(post.subscribeId, {
        id: post.subscribeId,
        name: post.subscribeName,
        avatar: post.subscribeAvatar,
        postCount: 0
      });
    }
    subscribeMap.get(post.subscribeId).postCount++;
  });
  const arr = Array.from(subscribeMap.values());
  // 随机排序（Fisher-Yates 洗牌算法）
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  subscribes.value = arr;
}

// 筛选后的文章列表
const filteredPosts = computed(() => {
  if (!selectedSourceId.value) return posts.value;
  return posts.value.filter(post => post.subscribeId === selectedSourceId.value);
});

// 重新加载订阅文章（错误重试用）
async function reload() {
  await refresh();
  computeSubscribes();
}

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes === 0 ? '刚刚' : `${minutes}分钟前`;
    }
    return `${hours}小时前`;
  } else if (days === 1) {
    return '昨天';
  } else if (years > 0) {
    return `${years}年前`;
  } else if (months > 0) {
    return `${months}个月前`;
  } else if (weeks > 0) {
    return `${weeks}周前`;
  } else {
    return `${days}天前`;
  }
}

function truncateDescription(desc: string | null, maxLength = 150) {
  if (!desc) return '';
  return desc.length > maxLength ? desc.substring(0, maxLength) + '...' : desc;
}

// 选择订阅源
function selectSubscribe(sourceId: number | null) {
  if (sourceId === selectedSourceId.value) return;

  const query = { ...route.query };
  if (sourceId) {
    query.source = sourceId.toString();
  } else {
    delete query.source;
  }

  // 更新动画key以触发重新渲染
  animatinKey.value++;

  navigateTo({ query });
}

// 清除筛选
function clearFilter() {
  selectSubscribe(null);
}

// 监听筛选变化，触发动画
watch(() => selectedSourceId.value, async () => {
  await nextTick();
  setTimeout(() => {
    document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
      el.classList.add("fade-in-start");
    });
  }, 50);
});
</script>

<template>
  <div class="container mx-auto max-w-6xl">
    <!-- 页面头部 -->
    <header class="mb-8 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-2.5">订阅文章</h1>
      <p class="text-[0.8em] text-slate-600 dark:text-slate-400">来自各大订阅源的最新文章，每{{ feedCacheInterval }}小时自动更新</p>
    </header>

    <!-- 加载占位：客户端重新拉取（如错误重试）时避免空白 -->
    <div v-if="!isLoaded" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-if="isLoaded && error" class="text-center py-16 animate-fade-in">
      <Icon name="lucide:alert-circle" class="size-16 text-destructive/50 mx-auto mb-4" />
      <p class="text-muted-foreground mb-4">{{ error }}</p>
      <Button variant="outline" @click="reload">重试</Button>
    </div>

    <!-- 空状态 -->
    <div v-if="isLoaded && posts.length === 0 && !error" class="text-center py-16 animate-fade-in">
      <Icon name="lucide:rss" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">暂无订阅文章</p>
      <p class="text-sm text-muted-foreground mt-2">请先在后台添加订阅源并更新</p>
    </div>

    <!-- 主内容区 -->
    <div v-if="isLoaded && posts.length > 0" class="flex gap-6">
      <!-- 左侧订阅源列表 -->
      <aside class="w-12 lg:w-16 shrink-0 animate-fade-in">
        <div
          ref="sidebarRef"
          class="sticky top-22 flex flex-col gap-2 overflow-y-auto overflow-x-hidden h-fit max-h-[calc(100vh-8rem)] pr-1 scrollbar-hide"
        >
          <button
            @click="clearFilter"
            :class="[
              'flex shrink-0 items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg transition-all duration-300 border-2',
              !selectedSourceId
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            ]"
            v-tooltip.right="'全部订阅'"
          >
            <Icon name="lucide:layout-grid" class="size-4 lg:size-5" />
          </button>

          <!-- 订阅源列表 -->
          <button
            v-for="subscribe in displayedSubscribes"
            :key="subscribe.id"
            @click="selectSubscribe(subscribe.id)"
            :class="[
              'flex shrink-0 items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg overflow-hidden transition-all border-2',
              selectedSourceId === subscribe.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            ]"
            v-tooltip.right="subscribe.name"
          >
            <!-- 头像 -->
            <template v-if="subscribe.avatar">
              <img
                :src="subscribe.avatar"
                :alt="subscribe.name"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </template>
            <template v-else>
              <span class="font-semibold text-xs lg:text-sm">
                {{ subscribe.name.charAt(0) }}
              </span>
            </template>
          </button>

          <!-- 展开 / 收起按钮 -->
          <button
            v-if="remainingCount > 0 && !isExpanded"
            key="expand-subscribes"
            @click="toggleExpanded($event)"
            class="flex shrink-0 items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg transition-all duration-300 border-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 relative overflow-hidden"
            v-tooltip.right="expandTooltip"
          >
            <span class="font-semibold text-xs lg:text-sm text-slate-600 dark:text-slate-400">
              +{{ remainingCount }}
            </span>
          </button>

          <button
            v-else-if="remainingCount > 0"
            key="collapse-subscribes"
            @click="toggleExpanded($event)"
            class="flex shrink-0 items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg transition-all duration-300 border-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 relative overflow-hidden"
            v-tooltip.right="collapseTooltip"
          >
            <span class="font-semibold text-xs lg:text-sm text-red-500 dark:text-red-400">
              ×
            </span>
          </button>
        </div>
      </aside>

      <!-- 右侧文章列表 -->
      <main class="flex-1 min-w-0">
        <!-- 文章列表 -->
        <div class="space-y-6" :key="animatinKey">
          <article
            v-for="post in filteredPosts"
            :key="post.id"
            class="border border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:shadow-md hover:border-blue-500 dark:hover:border-blue-500 transition-all animate-fade-in bg-white dark:bg-slate-800/50"
          >
            <div class="flex items-start gap-4">
              <!-- 订阅源头像 -->
              <button
                @click="selectSubscribe(post.subscribeId)"
                class="shrink-0"
                :title="post.subscribeName"
              >
                <Avatar class="size-10">
                  <AvatarImage v-if="post.subscribeAvatar" :src="post.subscribeAvatar" />
                  <AvatarFallback>{{ post.subscribeName?.charAt(0) || '?' }}</AvatarFallback>
                </Avatar>
              </button>

              <!-- 文章内容 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span class="text-sm text-slate-600 dark:text-slate-400">{{ post.subscribeName }}</span>
                  <span v-if="post.pubDate" class="text-xs text-slate-500 dark:text-slate-500">
                    {{ formatDate(post.pubDate) }}
                  </span>
                </div>
                <a
                  :href="post.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block group"
                >
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {{ post.title }}
                  </h2>
                </a>
                <p
                  v-if="post.description"
                  class="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2"
                >
                  {{ truncateDescription(post.description) }}
                </p>
              </div>

              <!-- 外部链接图标 -->
              <a
                :href="post.link"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-slate-500 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mt-1"
                :title="post.title"
              >
                <Icon name="lucide:external-link" class="size-5" />
              </a>
            </div>
          </article>

          <!-- 筛选后无结果 -->
          <div v-if="filteredPosts.length === 0 && selectedSourceId" class="text-center py-12 animate-fade-in">
            <Icon name="lucide:file-question" class="size-12 text-muted-foreground/30 mx-auto mb-3" />
            <p class="text-muted-foreground">该订阅源暂无文章</p>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}

/* 隐藏滚动条 */
.scrollbar-hide {
  -ms-overflow-style: none !important;
  scrollbar-width: none !important;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

/* 细滚动条样式 */
aside div::-webkit-scrollbar {
  width: 4px;
}

aside div::-webkit-scrollbar-track {
  background: transparent;
}

aside div::-webkit-scrollbar-thumb {
  background-color: rgb(229 231 235);
  border-radius: 4px;
  transition: background-color 0.2s;
}

aside div::-webkit-scrollbar-thumb:hover {
  background-color: rgb(203 213 225);
}

.dark aside div::-webkit-scrollbar-thumb {
  background-color: rgb(55 65 81);
}

.dark aside div::-webkit-scrollbar-thumb:hover {
  background-color: rgb(75 85 99);
}

/* 小屏幕优化 */
@media (max-width: 640px) {
  /* 在小屏幕上调整边栏宽度 */
  aside {
    width: 2.75rem !important;
  }

  /* 小屏幕上订阅源按钮尺寸 */
  aside button {
    width: 2.25rem !important;
    height: 2.25rem !important;
  }
}
</style>
