<script setup lang="ts">
import { siteConfig } from "~~/site.config";

// 地图入口（小胶囊）。两种用法：
// 1) views：按「相关性」传入要展示的视图——订阅页/友链页/首页放「博客网络」，留言板放「访客分布」…。
// 2) places：自定义地点胶囊（文章页逐地点渲染），标签=name，点击聚焦到 /map?view=travels&place=<id>。
const props = defineProps<{
  views?: Array<"travels" | "footprint" | "blogs">;
  places?: Array<{ id: string | number; name: string }>;
  /** places 胶囊用的图标，默认 ri:map-pin-line；文章页沿用原 ri:map-2-line */
  placeIcon?: string;
  title?: string;
}>();

// 站点总开关：未配置高德 apikey 的环境（如生产）可在 site.config.ts 的 amap.entryLinks 关闭，
// 此时整站所有 MapEntryLinks 一律不渲染，避免出现指向「无法加载的地图页」的死链。
const linksEnabled = import.meta.dev
  ? siteConfig.amap.entryLinks.development
  : siteConfig.amap.entryLinks.production;

const MAP = {
  travels: { value: "travels", label: "我的足迹", icon: "ri:map-pin-line" },
  footprint: { value: "footprint", label: "访客分布", icon: "ri:user-location-line" },
  blogs: { value: "blogs", label: "博客网络", icon: "ri:global-line" },
} as const;

type Capsule = { key: string; label: string; icon: string; to: string };

const items = computed<Capsule[]>(() => {
  if (!linksEnabled) return [];
  // places 优先：逐地点渲染（文章页用）
  if (props.places?.length) {
    return props.places.map(p => ({
      key: `place-${p.id}`,
      label: p.name,
      icon: props.placeIcon ?? MAP.travels.icon,
      to: `/map?view=travels&place=${encodeURIComponent(p.id)}`,
    }));
  }
  const capsules: Capsule[] = [];
  for (const v of props.views ?? []) {
    const m = MAP[v];
    if (m) capsules.push({ key: `view-${m.value}`, label: m.label, icon: m.icon, to: `/map?view=${m.value}` });
  }
  return capsules;
});
</script>

<template>
  <div v-if="items.length" class="flex flex-wrap items-center gap-1">
    <Icon name="ri:map-2-line" mode="svg" class="text-xs text-slate-600 dark:text-slate-400" />
    <span v-if="title" class="text-xs text-slate-500 dark:text-slate-400">{{ title }}</span>
    <NuxtLink
      v-for="c in items"
      :key="c.key"
      :to="c.to"
      class="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40">
      <Icon mode="svg" :name="c.icon" class="size-3" />
      <span>{{ c.label }}</span>
    </NuxtLink>
  </div>
</template>
