<script setup lang="ts">
const route = useRoute();
const router = useRouter();

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");

// 搜索关键词
const searchKeyword = ref((route.query.q as string) || "");

// 搜索结果
const { data, pending, error, refresh } = await useFetch("/api/search", {
  query: {
    q: searchKeyword,
  },
});

const results = computed(() => data.value?.data?.results || []);
const total = computed(() => data.value?.data?.total || 0);

// 页面元数据
useHead({
  title: computed(() => `${searchKeyword.value ? `"${searchKeyword.value}" 的搜索结果` : "搜索"} - ${siteName.value}`),
});

// 触发渐入动画
function triggerFadeIn() {
  setTimeout(() => {
    document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
      el.classList.add("fade-in-start");
    });
  }, 50);
}

// 监听搜索关键词变化
watch(
  () => searchKeyword.value,
  () => {
    if (!pending.value) {
      triggerFadeIn();
    }
  },
);

// 监听 pending 状态变化
watch(pending, newPending => {
  if (!newPending) {
    triggerFadeIn();
  }
});

// 页面挂载时触发动画
onMounted(() => {
  triggerFadeIn();
});

// 执行搜索
function handleSearch() {
  if (searchKeyword.value.trim()) {
    router.push({ path: "/search", query: { q: searchKeyword.value.trim() } });
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
  if (!keyword || !text) return text;
  const regex = new RegExp(`(${keyword})`, "gi");
  return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>');
}
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <!-- 页面标题 -->
    <header class="mb-8 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-4">搜索</h1>

      <!-- 搜索框 -->
      <div class="relative">
        <Icon name="ri:search-line" class="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" mode="svg" />
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索文章标题、内容..."
          class="w-full pl-12 pr-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          @keydown="handleKeydown" />
        <Button
          v-if="searchKeyword"
          variant="ghost"
          size="icon"
          class="absolute right-2 top-1/2 -translate-y-1/2"
          @click="
            searchKeyword = '';
            handleSearch();
          ">
          <Icon name="ri:close-line" class="size-4" />
        </Button>
      </div>
    </header>

    <!-- 搜索结果 -->
    <div v-if="searchKeyword" class="animate-fade-in">
      <!-- 加载状态 -->
      <div v-if="pending" class="relative py-20">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p class="text-center text-muted-foreground mt-4">搜索中...</p>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="py-20 text-center">
        <Icon name="lucide:alert-circle" class="size-12 text-destructive mx-auto mb-4" />
        <h2 class="text-xl font-bold mb-2">搜索失败</h2>
        <p class="text-muted-foreground">请稍后再试</p>
      </div>

      <!-- 无结果 -->
      <div v-else-if="total === 0" class="py-20 text-center">
        <Icon name="ri:search-line" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
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
              :to="post.categorySlug ? `/content/${post.categorySlug}/${post.slug || post.cid}` : `/content/${post.slug || post.cid}`"
              class="block">
              <h3
                class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2"
                v-html="highlightKeyword(post.title, searchKeyword)" />
            </NuxtLink>

            <!-- 摘要 -->
            <div class="mb-3 space-y-2">
              <!-- 描述高亮 -->
              <p v-if="post.desc" class="text-sm text-muted-foreground line-clamp-2" v-html="highlightKeyword(post.desc, searchKeyword)" />

              <!-- 内容摘要高亮 -->
              <p
                v-if="post.contentSnippet"
                class="text-sm text-muted-foreground italic line-clamp-2"
                v-html="highlightKeyword(post.contentSnippet, searchKeyword)" />
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
    <div v-else class="py-20 text-center animate-fade-in">
      <Icon name="ri:search-line" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">输入关键词开始搜索</p>
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
</style>
