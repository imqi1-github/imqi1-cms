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
  headers: getInternalRequestHeaders(),
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

// 详情页链接：详情 API 按 slug 精确查，故 slug 缺失一律不可点。
// 分类段：有 slug 用之；无 categoryName 说明文章本就无分类，走 uncategorized 分支（API 支持）；
// 有 categoryName 却无 slug（分类 slug 缺失）则无有效 URL，不可点。
function resolveLink(content: { slug: string | null; categorySlug: string | null; categoryName: string | null }) {
  if (!content.slug) return null;
  if (content.categorySlug) return `/content/${content.categorySlug}/${content.slug}`;
  if (!content.categoryName) return `/content/uncategorized/${content.slug}`;
  return null;
}

// 取 API 返回的已净化关键词（后端去掉了 html 特殊字符等），用于客户端高亮，
// 避免用户输入含被剥字符时标题/描述高亮与正文摘要高亮不一致。
const sanitizedKeyword = computed(() => {
  const d = data.value;
  return (d && "data" in d && d.data.query) || searchKeyword.value;
});

// 相对时间（formatDate）依赖 now，SSR 与客户端各算一次虽极少跨天，但统一加 isHydrated 门控保持一致性
const isHydrated = ref(false);

// 页面元数据
usePageSeo({
  title: computed(() => `${searchKeyword.value ? `"${searchKeyword.value}" 的搜索结果` : "搜索"} - ${siteName.value}`),
  description: siteConfig.pageSeo.search.description,
  keywords: siteConfig.pageSeo.search.keywords,
});

// 搜索防抖：输入框每次按键都触发 watch，直接 refresh 会逐字符打 DB LIKE，造成布局抖动；
// 这里 300ms 防抖合并连续输入。回车走 handleSearch 的即时 refresh。
// isDebouncing 标记「防抖待发」窗口：关键词已变但 refresh 尚未触发，期间 useFetch 的 pending 仍为 false、
// data 仍存上次结果。若不标记，模板会先用新关键词渲染旧结果（或「没找到」），300ms 后才切到「搜索中」。
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const isDebouncing = ref(false);
function debouncedRefresh() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  isDebouncing.value = true;
  searchDebounceTimer = setTimeout(() => {
    isDebouncing.value = false;
    refresh();
  }, 300);
}

// 监听搜索关键词变化
watch(
  () => searchKeyword.value,
  newVal => {
    const q = newVal.trim();
    const currentQ = (route.query.q as string) || "";

    if (q !== currentQ) {
      router.replace({ path: "/search", query: q ? { q } : {} });
    }

    // 输入即搜（useFetch 的 watch:false 已禁用自动响应，由这里手动触发；防抖合并连续输入）
    if (q) {
      debouncedRefresh();
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

// FloatingInput 通过 defineExpose 暴露 focus()，onMounted 时自动聚焦
const searchInputRef = useTemplateRef<{ focus: () => void }>("searchInputRef");

onMounted(() => {
  isHydrated.value = true;
  searchInputRef.value?.focus();
});

// 执行搜索（与 watch 同步，仅在回车时手动触发刷新，避免 push 新增历史）
function handleSearch() {
  if (searchKeyword.value.trim()) {
    // 取消可能排队中的防抖刷新：回车走即时 refresh，不应再被延迟定时器二次触发，
    // 否则既重复请求，也会让 isDebouncing 状态与实际请求错乱。
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    isDebouncing.value = false;
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
  // 水合前用 UTC 绝对日期，避免 SSR 与客户端相对时间在边界处不一致
  if (!isHydrated.value) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
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
      <FloatingInput
        id="search-input"
        ref="searchInputRef"
        v-model="searchKeyword"
        leading-icon="ri:search-line"
        label="搜索文章标题、内容..."
        aria-label="搜索文章标题、内容"
        class="rounded-lg pr-12 hover:shadow-sm"
        @keydown="handleKeydown">
        <template #trailing>
          <Button
            v-if="searchKeyword"
            variant="ghost"
            size="icon"
            aria-label="清除搜索内容"
            @click="
              searchKeyword = '';
              handleSearch();
            ">
            <Icon name="ri:close-line" aria-hidden="true" class="size-4" />
          </Button>
        </template>
      </FloatingInput>
    </header>

    <!-- 搜索结果 -->
    <div v-if="searchKeyword" v-scroll-reveal role="status" aria-live="polite" aria-atomic="true">
      <!-- 加载状态（含防抖待发窗口：关键词已变但 refresh 尚未触发） -->
      <div v-if="pending || isDebouncing" class="relative py-20">
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
          <article v-for="content in results" :key="content.cid" class="group border rounded-lg p-5 hover:border-primary/50 hover:shadow-md transition-all">
            <!-- 标题：详情页按 slug 精确查，无有效链接（slug 缺失或分类 slug 缺失）时不可点 -->
            <NuxtLink
              v-if="resolveLink(content)"
              :to="resolveLink(content)!"
              class="block">
              <h3
                class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2"
                v-html="highlightKeyword(content.title, sanitizedKeyword)" />
            </NuxtLink>
            <h3
              v-else
              class="text-lg font-semibold text-foreground mb-2 line-clamp-2"
              v-html="highlightKeyword(content.title, sanitizedKeyword)" />

            <!-- 摘要 -->
            <div class="mb-3 space-y-2">
              <!-- 描述高亮 -->
              <p v-if="content.desc" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(content.desc, sanitizedKeyword)" />

              <!-- 正文高亮摘要（使用后端返回的 highlight 字段） -->
              <p
                v-if="content.highlight"
                class="text-sm text-muted-foreground italic line-clamp-3"
                v-html="content.highlight" />
            </div>

            <!-- 元信息 -->
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span v-if="content.categoryName" class="inline-flex items-center gap-1">
                <Icon name="ri:folder-line" class="size-3" />
                {{ content.categoryName }}
              </span>
              <span class="inline-flex items-center gap-1">
                <Icon name="ri:calendar-line" class="size-3" />
                {{ formatDate(content.createTime) }}
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
