<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const { data, pending, error } = await useFetch("/api/changelogs", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 获取当前筛选的分类
const route = useRoute();
const selectedClass = computed(() => {
  const classType = route.query.class;
  return classType || null;
});

// 用于强制重新渲染动画的key
const animatinKey = ref(0);

// 左侧边栏引用
const sidebarRef = ref<HTMLElement | null>(null);

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

// 所有分类类型
const classTypes = [
  { type: null, label: '全部', icon: 'lucide:layout-grid' },
  { type: '新增', label: '新增', icon: 'lucide:plus-circle' },
  { type: '优化', label: '优化', icon: 'lucide:zap' },
  { type: '修复', label: '修复', icon: 'lucide:bug' },
  { type: '删除', label: '删除', icon: 'lucide:trash-2' },
  { type: '重构', label: '重构', icon: 'lucide:refresh-cw' },
];

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

// 筛选后的日志列表
const filteredData = computed(() => {
  if (!data.value?.data) return [];

  if (!selectedClass.value) return data.value.data;

  return data.value.data.map(group => ({
    ...group,
    logs: group.logs.filter(log => log.class === selectedClass.value)
  })).filter(group => group.logs.length > 0);
});

// 选择分类
function selectClass(classType: string | null) {
  if (classType === selectedClass.value) return;

  const query = { ...route.query };
  if (classType) {
    query.class = classType;
  } else {
    delete query.class;
  }

  // 更新动画key以触发重新渲染
  animatinKey.value++;

  navigateTo({ query });
}

// 清除筛选
function clearFilter() {
  selectClass(null);
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

onMounted(() => {
  // 添加滚轮事件监听
  if (import.meta.client) {
    window.addEventListener('wheel', handleSidebarWheel, { passive: false });
  }

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

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener('wheel', handleSidebarWheel);
  }
});

// 监听筛选变化，触发动画
watch(() => selectedClass.value, async () => {
  await nextTick();
  setTimeout(() => {
    document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
      el.classList.add("fade-in-start");
    });
  }, 50);
});

// 页面元数据
useHead({
  title: computed(() => `更新日志 - ${siteName.value}`),
});
</script>

<template>
  <div class="container mx-auto max-w-6xl">
    <!-- 页面标题 -->
    <header class="mb-8 animate-fade-in">
      <h1 class="text-[3em] font-extrabold mb-2.5">更新日志</h1>
      <p class="text-[0.8em] text-slate-600 dark:text-slate-400">记录每一次迭代与改进</p>
    </header>

    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p class="ml-3 text-slate-500">加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-20 text-center animate-fade-in">
      <Icon name="lucide:alert-circle" class="size-12 text-red-500 mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">加载失败</h2>
      <p class="text-slate-500">获取更新日志时出错，请稍后再试。</p>
    </div>

    <!-- 主内容区 -->
    <div v-else-if="data?.data && data.data.length > 0" class="flex gap-6">
      <!-- 左侧分类筛选 -->
      <aside class="w-12 lg:w-16 shrink-0 animate-fade-in">
        <div
          ref="sidebarRef"
          class="sticky top-24 flex flex-col gap-2 overflow-y-auto overflow-x-hidden h-[calc(100vh-8rem)] pr-1 scrollbar-hide"
        >
          <button
            v-for="classType in classTypes"
            :key="classType.label"
            @click="classType.type === null ? clearFilter() : selectClass(classType.type)"
            :class="[
              'flex items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg transition-all duration-300 border-2',
              (selectedClass === null && classType.type === null) || selectedClass === classType.type
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            ]"
            :title="classType.label"
          >
            <Icon :name="classType.icon" class="size-4 lg:size-5" />
          </button>
        </div>
      </aside>

      <!-- 右侧日志列表 -->
      <main class="flex-1 min-w-0">
        <div class="space-y-8" :key="animatinKey">
          <section
            v-for="(group, index) in filteredData"
            :key="`${group.year}-${group.month}`"
            class="animate-fade-in"
          >
            <!-- 月份标题 -->
            <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
              <Icon name="lucide:calendar" class="size-5 text-blue-600 dark:text-blue-400" />
              {{ group.year }}年{{ group.month }}月
            </h2>

            <!-- 时间线 -->
            <div class="relative border-l-2 border-slate-200 dark:border-slate-700 pl-6 space-y-3">
              <!-- 每条日志 -->
              <div
                v-for="log in group.logs"
                :key="log.id"
                class="relative group"
              >
                <!-- 时间线节点 -->
                <div class="absolute -left-[33px] top-1.5 size-4 rounded-full bg-blue-600 dark:bg-blue-400 border-4 border-white dark:border-slate-900 group-hover:scale-125 transition-transform" />

                <!-- 日志内容卡片 -->
                <div class="bg-white dark:bg-slate-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all">
                  <!-- 顶部信息 -->
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <!-- 分类标签 -->
                    <span :class="['px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1', getClassInfo(log.class).color]">
                      <Icon :name="getClassInfo(log.class).icon" class="size-3" />
                      {{ getClassInfo(log.class).label }}
                    </span>

                    <!-- 时间 -->
                    <span class="text-xs text-slate-500 dark:text-slate-400">
                      {{ formatDate(log.createTime) }}
                    </span>
                  </div>

                  <!-- 描述内容 -->
                  <div
                    class="prose prose-slate dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed markdown-content"
                    v-html="log.descHtml"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- 筛选后无结果 -->
          <div v-if="filteredData.length === 0 && selectedClass" class="text-center py-12 animate-fade-in">
            <Icon name="lucide:file-question" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p class="text-slate-500 dark:text-slate-400">该分类暂无日志</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 空状态 -->
    <div v-else class="py-20 text-center animate-fade-in">
      <Icon name="lucide:file-text" class="size-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <p class="text-slate-500 dark:text-slate-400">暂无更新日志</p>
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

/* Markdown 内容样式 */
.markdown-content > * {
  line-height: 1.6;
}

.markdown-content :deep(p) {
  line-height: 1.6;
}

.markdown-content :deep(strong) {
  font-weight: 700;
  color: rgb(15 23 42); /* slate-900 */
}

.markdown-content :deep(.dark strong) {
  color: rgb(226 232 240); /* slate-200 */
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(s) {
  text-decoration: line-through;
  color: rgb(100 116 139); /* slate-500 */
}

.markdown-content :deep(.dark s) {
  color: rgb(148 163 184); /* slate-400 */
}

.markdown-content :deep(code) {
  background-color: rgb(241 245 249); /* slate-100 */
  color: rgb(15 23 42); /* slate-900 */
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  font-family: JetBrains Mono, monospace;
}

.markdown-content :deep(.dark code) {
  background-color: rgb(30 41 59); /* slate-800 */
  color: rgb(226 232 240); /* slate-200 */
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  padding-left: 1.5em;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li::marker) {
  color: rgb(100 116 139); /* slate-500 */
}

.markdown-content :deep(.dark li::marker) {
  color: rgb(148 163 184); /* slate-400 */
}
</style>
