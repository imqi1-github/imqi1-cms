<script setup lang="ts">
const { data, pending, error } = await useFetch("/api/archiving", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");

// 页面元数据
useHead({
  title: computed(() => `文章归档 - ${siteName.value}`),
});

// 格式化日期
function formatDate(dateStr: string | Date) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

// 格式化完整日期
function formatFullDate(dateStr: string | Date) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 折叠状态管理 - 默认只有第一个（最新的）月份展开
const expandedMonths = ref<Set<string>>(new Set());

// 初始化：在数据加载完成后，将第一个月份设置为展开
watch(
  () => data.value?.data?.groups,
  (groups) => {
    if (groups && groups.length > 0 && expandedMonths.value.size === 0) {
      // 只在第一次且当前没有展开的月份时，展开第一个（最新的）月份
      const firstGroup = groups[0];
      expandedMonths.value.add(`${firstGroup.year}-${firstGroup.month}`);
    }
  },
  { immediate: true }
);

// 切换月份展开/折叠状态
function toggleMonth(year: number, month: number) {
  const key = `${year}-${month}`;
  if (expandedMonths.value.has(key)) {
    expandedMonths.value.delete(key);
  } else {
    expandedMonths.value.add(key);
  }
  // 触发响应式更新
  expandedMonths.value = new Set(expandedMonths.value);
}

// 检查月份是否展开
function isMonthExpanded(year: number, month: number): boolean {
  return expandedMonths.value.has(`${year}-${month}`);
}

onMounted(() => {
  // 初始化滚动渐入动画
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
    fadeInObserver.observe(el);
  });
});
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <header class="mb-8 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-2.5">文章归档</h1>
      <p class="text-[0.8em] text-slate-600 dark:text-slate-400">共收录 {{ data?.data?.stats?.total || 0 }} 篇文章</p>
    </header>

    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-20 text-center">
      <Icon name="lucide:alert-circle" class="size-12 text-destructive mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">加载失败</h2>
      <p class="text-muted-foreground">获取归档时出错，请稍后再试。</p>
    </div>

    <!-- 归档列表 -->
    <div v-else-if="data?.data?.groups && data.data.groups.length > 0" class="space-y-4">
      <section
        v-for="(group, index) in data.data.groups"
        :key="`${group.year}-${group.month}`"
        class="animate-fade-in border rounded-lg overflow-hidden"
        :style="{ animationDelay: `${index * 50}ms` }">
        <!-- 月份标题 - 可点击 -->
        <button
          @click="toggleMonth(group.year, group.month)"
          class="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer">
          <div class="flex items-center gap-2">
            <Icon
              :name="isMonthExpanded(group.year, group.month) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-5 text-primary transition-transform duration-200"
              :class="{ 'rotate-0': isMonthExpanded(group.year, group.month), '-rotate-90': !isMonthExpanded(group.year, group.month) }" />
            <Icon name="lucide:calendar" class="size-5 text-primary" />
            <span class="text-xl font-bold">{{ group.year }}年{{ group.month }}月</span>
            <span class="text-sm font-normal text-muted-foreground">({{ group.posts.length }} 篇)</span>
          </div>
          <Icon
            :name="isMonthExpanded(group.year, group.month) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="size-4 text-muted-foreground transition-transform duration-200" />
        </button>

        <!-- 文章列表 - 根据展开状态显示/隐藏 -->
        <div
          v-show="isMonthExpanded(group.year, group.month)"
          class="px-4 pb-3 space-y-2">
          <div
            v-for="post in group.posts"
            :key="post.cid"
            class="group flex items-center gap-3 py-2.5 px-4 rounded-lg hover:bg-muted/50 transition-colors">
            <!-- 日期 -->
            <div class="text-sm text-muted-foreground w-16 flex-shrink-0">
              {{ formatDate(post.createTime) }}
            </div>

            <!-- 文章标题 -->
            <NuxtLink
              :to="post.categorySlug ? `/content/${post.categorySlug}/${post.slug || post.cid}` : `/content/${post.slug || post.cid}`"
              class="flex-1 font-medium hover:text-primary transition-colors line-clamp-1">
              {{ post.title }}
            </NuxtLink>

            <!-- 箭头图标 -->
            <Icon
              name="lucide:chevron-right"
              class="size-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
          </div>
        </div>
      </section>
    </div>

    <!-- 空状态 -->
    <div v-else class="py-20 text-center">
      <Icon name="lucide:file-text" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">暂无文章</p>
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
