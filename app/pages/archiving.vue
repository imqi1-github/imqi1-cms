<script setup lang="ts">
const { data, pending, error } = await useFetch("/api/archiving");

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");

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
    <div v-else-if="data?.data?.groups && data.data.groups.length > 0" class="space-y-8">
      <section
        v-for="(group, index) in data.data.groups"
        :key="`${group.year}-${group.month}`"
        class="animate-fade-in"
        :style="{ animationDelay: `${index * 50}ms` }">
        <!-- 月份标题 -->
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Icon name="lucide:calendar" class="size-5 text-primary" />
          {{ group.year }}年{{ group.month }}月
          <span class="text-sm font-normal text-muted-foreground"> ({{ group.posts.length }} 篇) </span>
        </h2>

        <!-- 文章列表 -->
        <div class="space-y-2">
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
