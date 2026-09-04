<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from "vue";

import {useScrollFadeMask} from "~/composables/useScrollFadeMask";
import {siteConfig} from "~~/site.config";
import {CHANGELOG_META, CHANGELOG_TYPES, getChangelogMeta, isChangelogType,} from "#shared/changelog";
import type {ChangelogEntry, ChangelogGroup} from "~/types/apis/changelogs";

// 离场淡出：旧页在新页数据就绪前完整淡出（Suspense 挂起时长覆盖 fadeDuration），SSR/水合为 no-op
await useFadeOutOnNavigate();
const { data, pending, error } = await useFetch<{ data: ChangelogGroup[] }>("/api/changelogs", {
  headers: getInternalRequestHeaders(),
});

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth } = useAuth();

// 获取当前筛选的类型（一条记录可含多个条目，筛选命中任一条目的 type）
const route = useRoute();
const selectedType = computed(() => {
  const t = route.query.type;
  // 数组（?type=a&type=b）或非法类型都回退 null，避免筛选恒空
  return isChangelogType(t) ? t : null;
});

// 用于强制重新渲染动画的key
const animationKey = ref(0);

// 相对/绝对时间（formatDate）依赖时区，SSR 按服务器时区、客户端按访客时区各算一次会文本 mismatch；
// 水合前统一给 UTC，水合后再切访客本地时间。
const isHydrated = ref(false);

// 左侧边栏引用
const sidebarRef = ref<HTMLElement | null>(null);

// 侧栏滚动时的上下羽化边缘（仅高度不足需滚动时才出现）
const { atTop, atBottom } = useScrollFadeMask(sidebarRef);

// 处理左侧边栏的滚轮事件
function handleSidebarWheel(event: WheelEvent) {
  const sidebar = sidebarRef.value;
  if (sidebar && event.target instanceof Node && sidebar.contains(event.target)) {
    const delta = event.deltaY;
    // 仅当侧栏真正可滚动、且当前方向还能再滚时才拦截；否则放行让页面滚动（否则悬停左侧窄条会吞掉整页滚轮）
    const canScroll =
      sidebar.scrollHeight > sidebar.clientHeight + 1 &&
      !(
        (delta > 0 && sidebar.scrollTop + sidebar.clientHeight >= sidebar.scrollHeight - 1) ||
        (delta < 0 && sidebar.scrollTop <= 1)
      );
    if (!canScroll) return;

    event.preventDefault();
    event.stopPropagation();
    sidebar.scrollTop += delta;
  }
}

// 所有分类类型（全部 + 7 类）
const classTypes = [
  { type: null, label: '全部', icon: 'lucide:layout-grid' },
  ...CHANGELOG_TYPES.map(t => ({
    type: t,
    label: CHANGELOG_META[t].label,
    icon: CHANGELOG_META[t].icon,
  })),
];

// 筛选后的日志列表
const filteredData = computed(() => {
  if (!data.value?.data) return [];

  if (!selectedType.value) return data.value.data;

  return data.value.data.map(group => ({
    ...group,
    logs: group.logs.filter(log =>
      Array.isArray(log.content) && log.content.some(c => c.type === selectedType.value)
    )
  })).filter(group => group.logs.length > 0);
});

// 当前记录下需要展示的条目（筛选时只显示命中类型的条目）
function visibleEntries(content: ChangelogEntry[] | undefined) {
  if (!selectedType.value) return content || [];
  return (content || []).filter(c => c.type === selectedType.value);
}

// 选择类型
function selectType(type: string | null) {
  if (type === selectedType.value) return;

  const query = { ...route.query };
  if (type) {
    query.type = type;
  } else {
    delete query.type;
  }

  // 更新动画key以触发重新渲染
  animationKey.value++;

  navigateTo({ query });
}

// 清除筛选
function clearFilter() {
  selectType(null);
}

// 格式化日期。水合前用 UTC（两端一致，避免 hydration mismatch），水合后切访客本地时间。
function formatDate(dateStr: string | Date) {
  // 防御空/非法日期：new Date(undefined/非法串) 得 Invalid Date，会把 NaN 拼进页面
  if (dateStr === null || dateStr === undefined || dateStr === "") return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  if (!isHydrated.value) {
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    return `${month}月${day}日 ${hour}:${minute}`;
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}月${day}日 ${hour}:${minute}`;
}

onMounted(() => {
  isHydrated.value = true;

  // 添加滚轮事件监听
  if (import.meta.client) {
    window.addEventListener('wheel', handleSidebarWheel, { passive: false });
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener('wheel', handleSidebarWheel);
  }
});

// 页面元数据
usePageSeo({
  title: computed(() => `更新日志 - ${siteName.value}`),
  description: siteConfig.pageSeo.changelogs.description,
  keywords: siteConfig.pageSeo.changelogs.keywords,
});
</script>

<template>
  <div class="container mx-auto max-w-6xl">
    <!-- 页面标题 -->
    <header v-scroll-reveal class="mb-8">
      <h1 class="text-[3em] font-extrabold mb-2.5">更新日志</h1>
      <p class="text-[0.8em] text-slate-600 dark:text-slate-400">记录每一次迭代与改进</p>
      <NuxtLink
        v-if="isLoggedIn && !isLoadingAuth"
        to="/admin/changelogs"
        target="_blank"
        class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
      >
        <Icon name="lucide:settings" class="size-3.5" />
        管理日志
      </NuxtLink>
    </header>

    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"/>
      <p class="ml-3 text-slate-500">加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" v-scroll-reveal class="py-20 text-center">
      <Icon name="lucide:alert-circle" class="size-12 text-red-500 mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">加载失败</h2>
      <p class="text-slate-500">获取更新日志时出错，请稍后再试。</p>
    </div>

    <!-- 主内容区 -->
    <div v-else-if="data?.data && data.data.length > 0" class="flex gap-6">
      <!-- 左侧分类筛选 -->
      <aside v-scroll-reveal class="w-12 lg:w-16 shrink-0">
        <div
          ref="sidebarRef"
          class="sidebar-fade sticky top-24 flex flex-col gap-2 overflow-y-auto overflow-x-hidden max-h-[calc(100vh-8rem)] h-fit pr-1 scrollbar-hide"
          :class="{ 'fade-top': !atTop, 'fade-bottom': !atBottom }"
        >
          <button
            v-for="classType in classTypes"
            :key="classType.label"
            v-tooltip.right="classType.label"
            :class="[
              'flex items-center justify-center w-10 h-10 aspect-square lg:w-11 lg:h-11 rounded-lg transition-all duration-300 border-2 cursor-pointer',
              (selectedType === null && classType.type === null) || selectedType === classType.type
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border-blue-400'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            ]"
            @click="classType.type === null ? clearFilter() : selectType(classType.type)"
          >
            <Icon :name="classType.icon" class="size-4 lg:size-5" />
          </button>
        </div>
      </aside>

      <!-- 右侧日志列表 -->
      <main class="flex-1 min-w-0">
        <div :key="animationKey" class="space-y-8">
          <section
            v-for="group in filteredData"
            :key="`${group.year}-${group.month}`"
            v-scroll-reveal
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
                <div class="absolute -left-8.25 top-4.5 size-4 rounded-full bg-blue-600 dark:bg-blue-400 border-4 border-white dark:border-slate-900 group-hover:scale-125 transition-transform" />

                <!-- 日志内容卡片 -->
                <div class="bg-white dark:bg-slate-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-sm transition-all">
                  <!-- 时间 -->
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span class="text-xs text-slate-500 dark:text-slate-400">
                      {{ formatDate(log.createTime) }}
                    </span>
                  </div>

                  <!-- 条目列表（一条记录可含多个更新条目；筛选时只显示命中类型） -->
                  <div class="space-y-2">
                    <div v-for="(entry, i) in visibleEntries(log.content)" :key="i" class="flex items-baseline gap-2">
                      <!-- 类型徽标 -->
                      <span
                        :class="[
                          'shrink-0 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1',
                          getChangelogMeta(entry.type).color,
                        ]"
                      >
                        <Icon :name="getChangelogMeta(entry.type).icon" class="size-3" />
                        {{ getChangelogMeta(entry.type).label }}
                      </span>

                      <!-- 条目内容 -->
                      <div
                        class="prose prose-slate dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed markdown-content flex-1 min-w-0"
                        v-html="entry.html"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 筛选后无结果 -->
          <div v-if="filteredData.length === 0 && selectedType" v-scroll-reveal class="text-center py-12">
            <Icon name="lucide:file-question" class="size-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p class="text-slate-500 dark:text-slate-400">该分类暂无日志</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 空状态 -->
    <div v-else v-scroll-reveal class="py-20 text-center">
      <Icon name="lucide:file-text" class="size-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
      <p class="text-slate-500 dark:text-slate-400">暂无更新日志</p>
    </div>
  </div>
</template>

<style scoped>
/* 注册为 <length> 才能让 CSS 变量参与 transition 过渡 */
@property --fade-top {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
@property --fade-bottom {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}

/* 侧栏上下羽化边缘：默认不羽化，滚动到有隐藏内容时按需开启对应一端。
   --fade-top / --fade-bottom 控制两端渐隐高度，避开需要滚动时才生效。 */
.sidebar-fade {
  --fade-top: 0px;
  --fade-bottom: 0px;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--fade-top),
    #000 calc(100% - var(--fade-bottom)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--fade-top),
    #000 calc(100% - var(--fade-bottom)),
    transparent 100%
  );
  transition: --fade-top 0.25s ease, --fade-bottom 0.25s ease;
}

.sidebar-fade.fade-top {
  --fade-top: 1.75rem;
}

.sidebar-fade.fade-bottom {
  --fade-bottom: 1.75rem;
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
  font-family: var(--font-mono);
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
</style>
