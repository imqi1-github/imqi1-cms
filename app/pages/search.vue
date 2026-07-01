<script setup lang="ts">
import { escapeHtml, escapeRegExp } from "~~/lib/html";
import { siteConfig } from "~~/site.config";

const route = useRoute();
const router = useRouter();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 搜索关键词：初始值取自 URL 的 q。
const initialQ = (route.query.q as string) || "";
const searchKeyword = ref(initialQ);

// app.vue 的页面渐出依赖「新页顶层 await 挂起 Suspense 期间、旧页 DOM 保持挂载」：
// page:start 把 mainOpacity 置 0，只要 setup 的 await 不 resolve，旧页就不会被替换、淡出看得到。
// 有 q 时下方 useFetch 的真实请求会自然挂起；无 q 时不发空查询，需人为挂起一个 fadeDuration
// 复刻这个窗口（见 useFadeOutOnNavigate），否则新页瞬间替换旧页、旧页来不及渐出。
if (!initialQ) {
  await useFadeOutOnNavigate();
}

// 搜索结果
const { data, pending, error, refresh } = await useFetch("/api/search", {
  headers: {
    "x-ssr-internal-request": "true",
  },
  query: {
    q: searchKeyword,
  },
  // 仅带 q 进入时初始化查询（真实请求同时挂起 Suspense 让旧页渐出）；
  // 无 q 进入时不发空查询——渐出已由上方的人为挂起保证。
  immediate: !!initialQ,
  // 禁用 query 自动响应式，改由下方 watch + debounce 手动 refresh 控制，
  // 否则 useFetch 自动触发与手动 refresh 会重复请求，导致布局抖动
  watch: false,
  // 标记错误已处理，避免全局 toast 重复提示
  onResponseError({ error: fetchError }) {
    (fetchError as Error & { __handled__?: boolean }).__handled__ = true;
  },
});

const results = computed(() => {
  const d = data.value;
  return d && "data" in d ? d.data.results || [] : [];
});
const total = computed(() => {
  const d = data.value;
  return d && "data" in d ? d.data.total || 0 : 0;
});

// 页面元数据
usePageSeo({
  title: computed(() => `${searchKeyword.value ? `"${searchKeyword.value}" 的搜索结果` : "搜索"} - ${siteName.value}`),
  description: siteConfig.pageSeo.search.description,
  keywords: siteConfig.pageSeo.search.keywords,
});

// 监听搜索关键词变化
watch(
  () => searchKeyword.value,
  newVal => {
    const q = newVal.trim();
    const currentQ = (route.query.q as string) || "";

    if (q !== currentQ) {
      router.replace({ path: "/search", query: q ? { q } : {} });
    }

    // 输入即搜（useFetch 的 watch:false 已禁用自动响应，由这里手动触发）
    if (q) {
      refresh();
    }
  },
);

// 监听 URL 的 q 变化：在搜索页内用右键菜单「站内搜索」会 push 到同一路由 /search?q=…，
// 此时组件复用、setup 不会重读 route.query.q，searchKeyword 不变 → 上面的 watch 不触发、不搜索。
// 这里把 URL 的 q 同步回 searchKeyword，再由上面的 watch 接力 refresh（相等值赋值 ref 不会触发，无环）。
watch(
  () => (route.query.q as string) || "",
  newQ => {
    if (newQ !== searchKeyword.value) {
      searchKeyword.value = newQ;
    }
  },
);

const searchInputRef = useTemplateRef<HTMLInputElement>("searchInputRef");

onMounted(() => {
  searchInputRef.value?.focus();
});

// 执行搜索（与 watch 同步，仅在回车时手动触发刷新，避免 push 新增历史）
function handleSearch() {
  if (searchKeyword.value.trim()) {
    refresh();
  }
}

// 回车搜索
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    handleSearch();
  }
}

// 格式化日期
function formatDate(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (years > 0) return `${years}年前`;
  if (months > 0) return `${months}个月前`;
  if (weeks > 0) return `${weeks}周前`;
  return `${days}天前`;
}

// 高亮关键词
function highlightKeyword(text: string, keyword: string) {
  if (!keyword || !text) return escapeHtml(text || "");
  const escapedText = escapeHtml(text);
  const escapedKeyword = escapeRegExp(keyword);
  const regex = new RegExp(`(${escapedKeyword})`, "gi");
  return escapedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>');
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- 页面标题 -->
    <header v-scroll-reveal class="mb-8">
      <h1 class="text-[3em] font-extrabold mb-4">搜索</h1>

      <!-- 搜索框 -->
      <div class="relative">
        <label class="sr-only" for="search-input">搜索文章标题、内容</label>
        <Icon name="ri:search-line" aria-hidden="true" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" mode="svg" />
        <input
          id="search-input"
          ref="searchInputRef"
          v-model="searchKeyword"
          type="text"
          aria-label="搜索文章标题、内容"
          placeholder="搜索文章标题、内容..."
          class="w-full pl-12 pr-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none hover:shadow-sm hover:border-blue-500 dark:hover:border-blue-600 focus:border-blue-500 dark:focus:border-blue-600 transition-all duration-300"
          @keydown="handleKeydown" >
        <Button
          v-if="searchKeyword"
          variant="ghost"
          size="icon"
          aria-label="清除搜索内容"
          class="absolute right-2 top-1/2 -translate-y-1/2"
          @click="
            searchKeyword = '';
            handleSearch();
          ">
          <Icon name="ri:close-line" aria-hidden="true" class="size-4" />
        </Button>
      </div>
    </header>

    <!-- 搜索结果 -->
    <div v-if="searchKeyword" v-scroll-reveal role="status" aria-live="polite" aria-atomic="true">
      <!-- 加载状态 -->
      <div v-if="pending" class="relative py-20">
        <div aria-hidden="true" class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"/>
        <p class="text-center text-muted-foreground mt-4">搜索中...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="py-20 text-center">
        <Icon name="lucide:alert-circle" aria-hidden="true" class="size-12 text-destructive mx-auto mb-4" />
        <h2 class="text-xl font-bold mb-2">搜索失败</h2>
        <p class="text-muted-foreground">请稍后再试</p>
      </div>

      <!-- 无结果 -->
      <div v-else-if="total === 0" class="py-20 text-center">
        <Icon name="ri:search-line" aria-hidden="true" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
        <p class="text-muted-foreground">
          没有找到与 "<span class="font-medium text-foreground">{{ searchKeyword }}</span
          >" 相关的文章
        </p>
      </div>

      <!-- 结果列表 -->
      <div v-else>
        <p class="text-sm text-muted-foreground mb-4">
          找到 <span class="font-bold text-foreground">{{ total }}</span> 篇相关文章
        </p>

        <div class="space-y-4">
          <article v-for="post in results" :key="post.cid" class="group border rounded-lg p-5 hover:border-primary/50 hover:shadow-md transition-all">
            <!-- 标题 -->
            <NuxtLink
              :to="`/content/${post.categorySlug || 'uncategorized'}/${post.slug || post.cid}`"
              class="block">
              <h3
                class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2"
                v-html="highlightKeyword(post.title, searchKeyword)" />
            </NuxtLink>

            <!-- 摘要 -->
            <div class="mb-3 space-y-2">
              <!-- 描述高亮 -->
              <p v-if="post.desc" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(post.desc, searchKeyword)" />

              <!-- 正文高亮摘要（使用后端返回的 highlight 字段） -->
              <p
                v-if="post.highlight"
                class="text-sm text-muted-foreground italic line-clamp-3"
                v-html="post.highlight" />
            </div>

            <!-- 元信息 -->
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span v-if="post.categoryName" class="inline-flex items-center gap-1">
                <Icon name="ri:folder-line" class="size-3" />
                {{ post.categoryName }}
              </span>
              <span class="inline-flex items-center gap-1">
                <Icon name="ri:calendar-line" class="size-3" />
                {{ formatDate(post.createTime) }}
              </span>
            </div>
          </article>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else v-scroll-reveal class="py-20 text-center">
      <Icon name="ri:search-line" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">输入关键词开始搜索</p>
    </div>
  </div>
</template>
