<script setup lang="ts">
import { escapeHtml } from "~~/lib/html";
import { siteConfig } from "~~/site.config";
import type { HandledError } from "~/types/error";
import type { SearchResultItem, SearchType, SearchTypeConfig } from "~/types/apis/search";

const route = useRoute();
const router = useRouter();

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 搜索关键词：初始值取自 URL 的 q。
const initialQ = (route.query.q as string) || "";
const searchKeyword = ref(initialQ);

// 搜索类别：初始值取自 URL 的 type（非法值回退为「文章」）。
// 类别配置同时驱动 Tab 与各类别文案。
const SEARCH_TYPE_CONFIG: SearchTypeConfig[] = [
  { value: "content", label: "文章", icon: "ri:article-line" },
  { value: "subscribe", label: "订阅和友链", icon: "ri:rss-line" },
  { value: "comment", label: "评论", icon: "ri:chat-3-line" },
  { value: "subscribepost", label: "订阅文章", icon: "ri:newspaper-line" },
];

const initialType = (route.query.type as SearchType) || "content";
const searchType = ref<SearchType>(
  SEARCH_TYPE_CONFIG.some(t => t.value === initialType) ? initialType : "content",
);

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
    type: searchType,
  },
  // 仅带 q 进入时初始化查询（真实请求同时挂起 Suspense 让旧页渐出）；
  // 无 q 进入时不发空查询——渐出已由上方的人为挂起保证。
  immediate: !!initialQ,
  // 禁用 query 自动响应式，改由下方 watch + debounce 手动 refresh 控制，
  // 否则 useFetch 自动触发与手动 refresh 会重复请求，导致布局抖动
  watch: false,
  // 标记错误已处理，避免全局 toast 重复提示
  onResponseError({ error: fetchError }) {
    (fetchError as Error & HandledError).__handled__ = true;
  },
});

const results = computed<SearchResultItem[]>(() => {
  const d = data.value;
  return d && "data" in d ? (d.data.results as SearchResultItem[]) || [] : [];
});
const total = computed(() => {
  const d = data.value;
  return d && "data" in d ? d.data.total || 0 : 0;
});

// 结果项唯一 key（各类型主键字段不同）
function itemKey(item: SearchResultItem): string {
  switch (item.type) {
    case "content":
      return `content-${item.cid}`;
    case "subscribe":
      return `subscribe-${item.kind}-${item.id}`;
    case "comment":
      return `comment-${item.coid}`;
    case "subscribepost":
      return `subscribepost-${item.id}`;
  }
}

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
    // URL 与搜索一起在防抖沉淀后更新：只把「最终关键词」push 进历史，避免逐键压历史
    syncSearchUrl();
    refresh();
  }, 300);
}

// URL 同步：把当前 q/type 写入地址栏（仅非默认 type 才携带，保持 /search?q= 链接干净）。
// 用 router.push 让每次 query 变化都进入浏览历史，浏览器后退/前进可在关键词与类别间导航；
// vue-router 对相同 query 的 push 会判重（duplicated）忽略，不会重复压入历史。
function syncSearchUrl() {
  const q = searchKeyword.value.trim();
  const type = searchType.value;
  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (type !== "content") query.type = type;
  router.push({ path: "/search", query });
}

// 监听搜索关键词变化：输入即搜（useFetch 的 watch:false 已禁用自动响应，由这里手动触发；防抖合并连续输入）。
// URL 的 push 也收在 debouncedRefresh 的防抖回调里做，只把「沉淀后的关键词」写进地址栏并进入历史，避免逐键压历史。
watch(
  () => searchKeyword.value,
  newVal => {
    const q = newVal.trim();
    if (q) {
      debouncedRefresh();
    } else {
      // 关键词清空：取消排队中的防抖刷新（否则其会用空关键词触发一次 400 请求），并立即移除 URL 里的 q（保留 type）
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      isDebouncing.value = false;
      syncSearchUrl();
    }
  },
);

// 监听类别切换：同步 URL（push 进历史）并立即搜索（Tab 点击不防抖）
watch(
  () => searchType.value,
  (newType, oldType) => {
    if (newType === oldType) return;
    // 取消排队中的防抖刷新：避免其用旧关键词覆盖 URL / 再触发一次旧关键词搜索
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    isDebouncing.value = false;
    syncSearchUrl();
    if (searchKeyword.value.trim()) {
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

// 监听 URL 的 type 变化：从地址栏直接改 ?type=（或浏览器前进后退）时同步回 searchType，再走上面的 watch 接力 refresh
watch(
  () => (route.query.type as SearchType) || "content",
  newType => {
    if (newType !== searchType.value && SEARCH_TYPE_CONFIG.some(t => t.value === newType)) {
      searchType.value = newType;
    }
  },
);

// FloatingInput 通过 defineExpose 暴露 focus()，onMounted 时自动聚焦
const searchInputRef = useTemplateRef<{ focus: () => void }>("searchInputRef");

onMounted(() => {
  isHydrated.value = true;
  searchInputRef.value?.focus();
});

// 离开搜索页时清理防抖定时器：否则 debouncedRefresh 会在组件卸载后仍触发
// router.push 把用户拽回 /search（router 是全局单例，push 照样生效）。
onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
});

// 执行搜索（与 watch 同步，仅在回车时手动触发刷新；回车是明确的搜索动作，URL 同步 + refresh 即时走）
function handleSearch() {
  if (searchKeyword.value.trim()) {
    // 取消可能排队中的防抖刷新：回车走即时 refresh，不应再被延迟定时器二次触发，
    // 否则既重复请求，也会让 isDebouncing 状态与实际请求错乱。
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
    isDebouncing.value = false;
    syncSearchUrl();
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
  // 先在「原始未转义文本」上求命中区间，再对原始文本 escapeHtml 并给命中区间包 <mark>。
  // 旧实现把高亮正则作用在 escapeHtml 后的文本上：搜 "&" 会命中 &amp; 里的 &、把实体拆成
  // "&(高亮)+amp;" 渲染出多余字面量；搜含 &<>"' 的关键词则因转义后无字面串而静默失效。
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const ranges: [number, number][] = [];
  let idx = 0;
  while ((idx = lowerText.indexOf(lowerKeyword, idx)) !== -1) {
    ranges.push([idx, idx + keyword.length]);
    idx += keyword.length;
  }
  if (ranges.length === 0) return escapeHtml(text);

  let out = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    out += escapeHtml(text.slice(cursor, start));
    out += `<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}

// 提取外链域名（订阅源/友链/订阅文章结果展示用）
function formatUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// 各类别文案：搜索框 placeholder / aria-label / 结果计数 / 空状态名词
const searchPlaceholder = computed(() => {
  switch (searchType.value) {
    case "subscribe":
      return "搜索订阅源或友链名称、链接...";
    case "comment":
      return "搜索评论内容、评论者...";
    case "subscribepost":
      return "搜索订阅文章标题、摘要...";
    default:
      return "搜索文章标题、内容...";
  }
});

const searchAriaLabel = computed(() => {
  switch (searchType.value) {
    case "subscribe":
      return "搜索订阅源或友链名称、链接";
    case "comment":
      return "搜索评论内容、评论者";
    case "subscribepost":
      return "搜索订阅文章标题、摘要";
    default:
      return "搜索文章标题、内容";
  }
});

const resultCountSuffix = computed(() => {
  switch (searchType.value) {
    case "subscribe":
      return "条相关订阅或友链";
    case "comment":
      return "条相关评论";
    case "subscribepost":
      return "条相关订阅文章";
    default:
      return "篇相关文章";
  }
});

const emptyNoun = computed(() => {
  switch (searchType.value) {
    case "subscribe":
      return "订阅或友链";
    case "comment":
      return "评论";
    case "subscribepost":
      return "订阅文章";
    default:
      return "文章";
  }
});
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
        :label="searchPlaceholder"
        :aria-label="searchAriaLabel"
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

    <!-- 类别 Tab：文章 / 订阅和友链 / 评论 / 订阅文章 -->
    <nav v-scroll-reveal class="mb-8" aria-label="搜索类别">
      <div class="flex flex-wrap gap-2" role="tablist">
        <button
          v-for="t in SEARCH_TYPE_CONFIG"
          :key="t.value"
          type="button"
          role="tab"
          :aria-selected="searchType === t.value"
          :class="[
            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-all cursor-pointer',
            searchType === t.value
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          ]"
          @click="searchType = t.value">
          <Icon :name="t.icon" class="size-4" aria-hidden="true" />
          {{ t.label }}
        </button>
      </div>
    </nav>

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
          >" 相关的{{ emptyNoun }}
        </p>
      </div>

      <!-- 结果列表 -->
      <div v-else>
        <p class="text-sm text-muted-foreground mb-4">
          找到 <span class="font-bold text-foreground">{{ total }}</span> {{ resultCountSuffix }}
        </p>

        <div class="space-y-4">
          <article
            v-for="item in results"
            :key="itemKey(item)"
            class="group border rounded-lg p-5 hover:border-blue-600 transition-all">

            <!-- ======== 文章结果 ======== -->
            <template v-if="item.type === 'content'">
              <!-- 标题：详情页按 slug 精确查，无有效链接（slug 缺失或分类 slug 缺失）时不可点 -->
              <NuxtLink
                v-if="resolveLink(item)"
                :to="resolveLink(item)!"
                class="block">
                <h3
                  class="text-lg font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2 line-clamp-2"
                  v-html="highlightKeyword(item.title, sanitizedKeyword)" />
              </NuxtLink>
              <h3
                v-else
                class="text-lg font-semibold text-foreground mb-2 line-clamp-2"
                v-html="highlightKeyword(item.title, sanitizedKeyword)" />

              <!-- 摘要 -->
              <div class="mb-3 space-y-2">
                <!-- 描述高亮 -->
                <p v-if="item.desc" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(item.desc, sanitizedKeyword)" />

                <!-- 正文高亮摘要（使用后端返回的 highlight 字段） -->
                <p
                  v-if="item.highlight"
                  class="text-sm text-muted-foreground italic line-clamp-3"
                  v-html="item.highlight" />
              </div>

              <!-- 元信息 -->
              <div class="flex items-center gap-3 text-xs text-muted-foreground">
                <span v-if="item.categoryName" class="inline-flex items-center gap-1">
                  <Icon name="ri:folder-line" class="size-3" />
                  {{ item.categoryName }}
                </span>
                <span class="inline-flex items-center gap-1">
                  <Icon name="ri:calendar-line" class="size-3" />
                  {{ formatDate(item.createTime) }}
                </span>
              </div>
            </template>

            <!-- ======== 订阅源 / 友链结果 ======== -->
            <template v-else-if="item.type === 'subscribe'">
              <div class="flex items-start gap-4">
                <!-- 头像（加载失败/缺失时字母回退） -->
                <div class="size-12 rounded-lg bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground shrink-0 overflow-hidden">
                  <img
                    v-if="item.avatar"
                    :src="item.avatar"
                    :alt="item.name"
                    loading="lazy"
                    class="w-full h-full object-cover">
                  <span v-else>{{ item.name.charAt(0).toUpperCase() }}</span>
                </div>

                <div class="flex-1 min-w-0">
                  <!-- 名称：订阅源点击进 /subscribes?source= 看其文章，友链点击外链 -->
                  <NuxtLink v-if="item.kind === 'subscribe'" :to="`/subscribes?source=${item.id}`" class="block">
                    <h3
                      class="text-lg font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1 line-clamp-2"
                      v-html="highlightKeyword(item.name, sanitizedKeyword)" />
                  </NuxtLink>
                  <a v-else :href="item.url" target="_blank" rel="noopener noreferrer" class="block">
                    <h3
                      class="text-lg font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1 line-clamp-2"
                      v-html="highlightKeyword(item.name, sanitizedKeyword)" />
                  </a>

                  <!-- 描述：仅显示简介；无简介（订阅源 desc 恒为 null）时留空，网址已在下方元信息行展示，避免重复 -->
                  <p v-if="item.desc" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(item.desc, sanitizedKeyword)" />
                </div>
              </div>

              <!-- 元信息 -->
              <div class="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                <span class="inline-flex items-center gap-1">
                  <Icon :name="item.kind === 'subscribe' ? 'ri:rss-line' : 'ri:link'" class="size-3" />
                  {{ item.kind === "subscribe" ? "订阅源" : "友链" }}
                </span>
                <span class="inline-flex items-center gap-1">
                  <Icon name="ri:global-line" class="size-3" />
                  {{ formatUrl(item.url) }}
                </span>
              </div>
            </template>

            <!-- ======== 评论结果 ======== -->
            <template v-else-if="item.type === 'comment'">
              <div class="flex items-start gap-4">
                <Avatar class="size-10 shrink-0">
                  <AvatarImage v-if="item.avatar" :src="item.avatar" :alt="item.name" />
                  <AvatarFallback>{{ item.name.charAt(0).toUpperCase() }}</AvatarFallback>
                </Avatar>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">{{ item.name }}</span>
                    <span>{{ formatDate(item.createTime) }}</span>
                  </div>
                  <p
                    class="text-sm text-foreground mb-2 line-clamp-3 whitespace-pre-wrap"
                    v-html="highlightKeyword(item.content, sanitizedKeyword)" />
                  <!-- 评论所在文章：有 articleUrl 才可点（留言板/已发布文章） -->
                  <div class="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    <Icon name="ri:article-line" class="size-3 shrink-0" />
                    <NuxtLink v-if="item.articleUrl" :to="item.articleUrl" class="text-blue-600 dark:text-blue-400 hover:underline truncate">
                      {{ item.articleTitle }}
                    </NuxtLink>
                    <span v-else class="truncate">{{ item.articleTitle }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- ======== 订阅文章结果 ======== -->
            <template v-else-if="item.type === 'subscribepost'">
              <div class="flex items-start gap-4">
                <!-- 来源头像 -->
                <div class="size-10 rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground shrink-0 overflow-hidden">
                  <img
                    v-if="item.subscribeAvatar"
                    :src="item.subscribeAvatar"
                    :alt="item.subscribeName"
                    loading="lazy"
                    class="w-full h-full object-cover">
                  <span v-else>{{ item.subscribeName.charAt(0).toUpperCase() }}</span>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                    <span>{{ item.subscribeName }}</span>
                    <span v-if="item.pubDate">{{ formatDate(item.pubDate) }}</span>
                  </div>
                  <!-- 标题：link 为空（非 http/https 被净化）时不可点 -->
                  <a v-if="item.link" :href="item.link" target="_blank" rel="noopener noreferrer" class="block group">
                    <h3
                      class="text-lg font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1 line-clamp-2"
                      v-html="highlightKeyword(item.title, sanitizedKeyword)" />
                  </a>
                  <h3 v-else class="text-lg font-semibold text-foreground mb-1 line-clamp-2" v-html="highlightKeyword(item.title, sanitizedKeyword)" />
                  <p v-if="item.description" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(item.description, sanitizedKeyword)" />
                </div>

                <!-- 外链图标 -->
                <a
                  v-if="item.link"
                  :href="item.link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors mt-1"
                  :title="item.title">
                  <Icon name="lucide:external-link" class="size-5" />
                </a>
              </div>
            </template>
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
