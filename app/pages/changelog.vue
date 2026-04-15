<script setup lang="ts">
const { data, pending, error } = await useFetch("/api/changelog");

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");

// 用户登录状态
const isLoggedIn = ref(false);
const isLoadingAuth = ref(true);

// 页面元数据
useHead({
  title: computed(() => `更新日志 - ${siteName.value}`),
});

// 获取分类对应的颜色和图标
function getClassInfo(classType: string) {
  const classMap: Record<string, { color: string; icon: string; label: string }> = {
    新增: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: "lucide:plus-circle", label: "新增" },
    优化: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: "lucide:zap", label: "优化" },
    修复: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: "lucide:bug", label: "修复" },
    删除: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: "lucide:trash-2", label: "删除" },
    重构: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: "lucide:refresh-cw", label: "重构" },
  };

  return classMap[classType] || { color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: "lucide:circle", label: classType };
}

// 格式化日期
function formatDate(dateStr: string | Date) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}月${day}日 ${hour}:${minute}`;
}

// 检查用户登录状态
const checkAuthStatus = async () => {
  if (import.meta.client) {
    try {
      const res = await $fetch('/api/auth/verify');
      isLoggedIn.value = (res as any).valid || false;
    } catch {
      isLoggedIn.value = false;
    } finally {
      isLoadingAuth.value = false;
    }
  }
};

onMounted(() => {
  // 检查登录状态
  checkAuthStatus();
  // 初始化滚动渐入动画
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

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
    fadeInObserver.observe(el);
  });
});
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <header class="mb-6 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-2.5">更新日志</h1>
      <div class="text-[0.8em] text-slate-600 dark:text-slate-400">
        <p>记录每一次迭代与改进</p>
        <!-- 编辑按钮（仅登录时显示） -->
        <ClientOnly>
          <a
            v-if="isLoggedIn && !isLoadingAuth"
            href="/admin/changelogs"
            target="_blank"
            class="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
            <Icon name="lucide:edit" class="size-3" />
            编辑日志
          </a>
        </ClientOnly>
      </div>
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
      <p class="text-muted-foreground">获取更新日志时出错，请稍后再试。</p>
    </div>

    <!-- 更新日志列表 -->
    <div v-else-if="data?.data && data.data.length > 0" class="space-y-8">
      <section
        v-for="(group, index) in data.data"
        :key="`${group.year}-${group.month}`"
        class="animate-fade-in"
        :style="{ animationDelay: `${index * 100}ms` }"
      >
        <!-- 月份标题 -->
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Icon name="lucide:calendar" class="size-5 text-primary" />
          {{ group.year }}年{{ group.month }}月
        </h2>

        <!-- 时间线 -->
        <div class="relative border-l-2 border-muted pl-6 space-y-3">
          <!-- 每条日志 -->
          <div
            v-for="log in group.logs"
            :key="log.id"
            class="relative group"
          >
            <!-- 时间线节点 -->
            <div class="absolute -left-[33px] top-1.5 size-4 rounded-full bg-primary border-4 border-background group-hover:scale-125 transition-transform" />

            <!-- 日志内容卡片 -->
            <div class="bg-card rounded-lg p-3 border border-border hover:border-primary/50 hover:shadow-md transition-all">
              <!-- 顶部信息 -->
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <!-- 分类标签 -->
                <span :class="['px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1', getClassInfo(log.class).color]">
                  <Icon :name="getClassInfo(log.class).icon" class="size-3" />
                  {{ getClassInfo(log.class).label }}
                </span>

                <!-- 时间 -->
                <span class="text-xs text-muted-foreground">
                  {{ formatDate(log.createTime) }}
                </span>
              </div>

              <!-- 描述内容 -->
              <div
                class="prose prose-slate dark:prose-invert max-w-none prose-p:text-xs prose-p:leading-relaxed"
                v-html="log.desc"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 空状态 -->
    <div v-else class="py-20 text-center">
      <Icon name="lucide:file-text" class="size-16 text-muted-foreground/30 mx-auto mb-4" />
      <p class="text-muted-foreground">暂无更新日志</p>
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
