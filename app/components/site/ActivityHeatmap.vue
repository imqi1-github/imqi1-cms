<script setup lang="ts">
import type { CategoryOption, HeatmapDayData, HeatmapData, HeatmapResponse, TagOption } from "~/types/apis/heatmap";

// 站点统计热力图：GitHub 风格贡献网格（行=周一~周日，列=周），
// 展示已发布文章 + 已审核评论的每日数量，支持分类/标签筛选与年份切换。
// 数据在客户端 onMounted 拉取：SSR 只渲染空壳（"加载中…"），避免 new Date() 两端不一致。

// ---- 筛选 ----
const categoryFilter = ref("");
const tagFilter = ref("");

const categoryOptions = ref<CategoryOption[]>([]);
const tagOptions = ref<TagOption[]>([]);

const loadOptions = async () => {
  const [categoriesRes, tagsRes] = await Promise.all([
    $fetch<{ success: boolean; data: CategoryOption[] }>("/api/categories", {
      query: { limit: 100 },
      headers: getInternalRequestHeaders(),
    }),
    $fetch<{ success: boolean; data: TagOption[] }>("/api/tags", {
      headers: getInternalRequestHeaders(),
    }),
  ]);
  // slug 为空的分筛选不了，直接过滤掉
  categoryOptions.value = (categoriesRes?.data ?? []).filter(cat => cat.slug);
  tagOptions.value = tagsRes?.data ?? [];
};

// ---- 热力图数据 ----
const heatmapData = ref<HeatmapData | null>(null);
const status = ref<"idle" | "pending" | "error">("idle");

const loadHeatmap = async () => {
  status.value = "pending";
  try {
    const res = await $fetch<HeatmapResponse>("/api/heatmap", {
      query: {
        category: categoryFilter.value || undefined,
        tag: tagFilter.value || undefined,
      },
      headers: getInternalRequestHeaders(),
    });
    if (res?.data) heatmapData.value = res.data;
    status.value = "idle";
  } catch {
    status.value = "error";
  }
};

onMounted(() => {
  void loadHeatmap();
  void loadOptions();
});
// 筛选变化时重新拉取；失败保留旧数据（无闪烁）
watch([categoryFilter, tagFilter], () => void loadHeatmap());

// ---- 年份/近一年视图 ----
const selectedView = ref<number>(0); // 0 = 近一年
const years = computed(() => heatmapData.value?.years ?? []);
const viewOptions = computed(() => [
  { value: 0, label: "近一年" },
  ...years.value.map(year => ({ value: year, label: String(year) })),
]);
const viewLabel = computed(() =>
  selectedView.value === 0 ? "近一年" : `${selectedView.value} 年`,
);

// ---- 网格构建 ----
type Cell = {
  key: string;
  level: number;
  articles: number;
  comments: number;
  tooltip: string;
} | null;

interface Week {
  key: string;
  monthLabel: string;
  cells: Cell[];
}

interface BuildResult {
  weeks: Week[];
  totals: { articles: number; comments: number };
}

// 强度映射到完整类名（Tailwind 扫描源码字面量）
const LEVEL_CLASSES: Record<number, string> = {
  0: "bg-slate-200/70 dark:bg-slate-700/40",
  1: "bg-blue-200 dark:bg-blue-900",
  2: "bg-blue-400 dark:bg-blue-700",
  3: "bg-blue-600 dark:bg-blue-500",
  4: "bg-blue-700 dark:bg-blue-400",
};

const levelFor = (count: number): number => {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
};

const toKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// 近一年起点：前推 364 天（52 周，与周对齐）
const recentStart = (today: Date): Date =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364);

function buildWeeks(start: Date, end: Date): BuildResult {
  const dayData = heatmapData.value?.days ?? {};
  const today = startOfToday();
  const endTs = Math.min(end.getTime(), today.getTime());

  // 第一列取 start 所在周的周一（含 start 之前的空白天）
  const colStart = new Date(start);
  colStart.setDate(colStart.getDate() - ((start.getDay() + 6) % 7));

  const weeks: Week[] = [];
  const totals = { articles: 0, comments: 0 };
  const cursor = new Date(colStart);

  while (cursor.getTime() <= endTs) {
    const mondayKey = toKey(cursor);
    const cells: Cell[] = [];
    let monthLabel = "";

    for (let i = 0; i < 7; i++) {
      const day = new Date(cursor);
      const ts = day.getTime();
      const inRange = ts >= start.getTime() && ts <= endTs;

      // 列内出现某月 1 号 → 该列显示月份标签
      if (inRange && day.getDate() === 1) {
        monthLabel = `${day.getMonth() + 1}月`;
      }

      if (!inRange) {
        cells.push(null);
      } else {
        const key = toKey(day);
        const d: HeatmapDayData | undefined = dayData[key];
        const articles = d?.articles ?? 0;
        const comments = d?.comments ?? 0;
        totals.articles += articles;
        totals.comments += comments;
        const total = articles + comments;
        cells.push({
          key,
          level: levelFor(total),
          articles,
          comments,
          tooltip: total > 0 ? `${key} · 文章 ${articles} · 评论 ${comments}` : `${key} · 无发布`,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push({ key: mondayKey, monthLabel, cells });
  }

  return { weeks, totals };
}

const grid = computed<BuildResult>(() => {
  const today = startOfToday();
  const view = selectedView.value;
  if (view === 0) {
    return buildWeeks(recentStart(today), today);
  }
  return buildWeeks(new Date(view, 0, 1), new Date(view, 11, 31));
});
</script>

<template>
  <div
    class="pointer-events-auto mt-10 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/40 p-5 max-md:p-4 transition-colors duration-300">
    <!-- 头部：标题 + 筛选 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
          <Icon name="ri:calendar-check-line" class="size-4 text-blue-600 dark:text-blue-400" />
          发布热力图
        </div>
        <span v-if="heatmapData" class="text-xs text-slate-400 dark:text-slate-500">
          {{ viewLabel }} · 文章 {{ grid.totals.articles }} · 评论 {{ grid.totals.comments }}
        </span>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <select
          v-model="categoryFilter"
          class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-200 outline-none transition-colors duration-200 focus:border-blue-400 dark:focus:border-blue-500">
          <option value="">全部分类</option>
          <option v-for="cat in categoryOptions" :key="cat.slug ?? cat.name" :value="cat.slug">{{ cat.name }}</option>
        </select>
        <select
          v-model="tagFilter"
          class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-200 outline-none transition-colors duration-200 focus:border-blue-400 dark:focus:border-blue-500">
          <option value="">全部标签</option>
          <option v-for="tag in tagOptions" :key="tag.slug" :value="tag.slug">{{ tag.name }}</option>
        </select>
      </div>
    </div>

    <!-- 年份切换 -->
    <div v-if="heatmapData && years.length" class="mt-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="option in viewOptions"
        :key="option.value"
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200"
        :class="
          selectedView === option.value
            ? 'bg-blue-600 text-white'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700/60'
        "
        @click="selectedView = option.value">
        {{ option.label }}
      </button>
    </div>

    <!-- 热力图网格 -->
    <div v-if="heatmapData && years.length" class="mt-5 flex items-start gap-1.5 overflow-x-auto pb-1">
      <!-- 左侧星期标签 -->
      <div class="mt-[15px] grid grid-rows-7 gap-[3px] text-[9px] leading-[12px] text-slate-400 dark:text-slate-500">
        <span class="h-3">一</span>
        <span class="h-3"/>
        <span class="h-3">三</span>
        <span class="h-3"/>
        <span class="h-3">五</span>
        <span class="h-3"/>
        <span class="h-3"/>
      </div>
      <!-- 周列 -->
      <div class="flex gap-[3px]">
        <div v-for="week in grid.weeks" :key="week.key" class="flex flex-col gap-[3px]">
          <div
            class="h-3 text-[9px] leading-[12px] text-slate-400 dark:text-slate-500 select-none"
            :class="week.monthLabel ? '' : 'invisible'">
            {{ week.monthLabel }}
          </div>
          <div class="grid grid-rows-7 gap-[3px]">
            <div
              v-for="(cell, cellIndex) in week.cells"
              :key="cell ? cell.key : `${week.key}-${cellIndex}`"
              v-tooltip="cell?.tooltip"
              class="size-3 rounded-[2px]"
              :class="LEVEL_CLASSES[cell?.level ?? 0]"/>
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div
      v-if="heatmapData && years.length"
      class="mt-4 flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500">
      <span>少</span>
      <div v-for="level in [0, 1, 2, 3, 4]" :key="level" class="size-3 rounded-[2px]" :class="LEVEL_CLASSES[level]"/>
      <span>多</span>
    </div>

    <!-- 加载 / 失败 / 空状态 -->
    <p v-else-if="status === 'error'" class="mt-4 text-sm text-slate-400 dark:text-slate-500">
      热力图加载失败
    </p>
    <p v-else-if="heatmapData" class="mt-4 text-sm text-slate-400 dark:text-slate-500">
      暂无发布数据
    </p>
    <p v-else class="mt-4 text-sm text-slate-400 dark:text-slate-500">加载中…</p>
  </div>
</template>
