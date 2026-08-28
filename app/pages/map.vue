<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";

import { CITY_COORDS } from "#shared/city-coords";
import { siteConfig } from "~~/site.config";
import type { BlogNetworkData } from "~/types/apis/blog-network";

const { siteSettings } = useSiteSettings();
const { isLoggedIn } = useAuth();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const isHydrated = ref(false);
// 年份依赖本地时区：SSR 与首帧水合都用 UTC 年份（一致、避免 hydration 警告），水合后再切访客本地年份。
// 仅在服务器与访客跨时区且临近跨年时才有差异，与其它页（订阅/更新日志/搜索）同口径。
const currentYear = computed(() => (isHydrated.value ? new Date().getFullYear() : new Date().getUTCFullYear()));

const route = useRoute();
const router = useRouter();

// 视图来自 query.view，默认「我的足迹」（travels）。可分享 / 书签。
const view = computed(() =>
  route.query.view === "footprint" ? "footprint" : route.query.view === "blogs" ? "blogs" : "travels",
);

const viewOptions = [
  { value: "travels", label: "我的足迹", icon: "ri:map-pin-line" },
  { value: "footprint", label: "访客分布", icon: "ri:user-location-line" },
  { value: "blogs", label: "博客网络", icon: "ri:global-line" },
];

// 访客分布 / 博客网络视图最大缩放级别：滚轮/点击放大都不会超过此值。
// 缩放数字「越大 = 放得越大 = 地图越细(街道级)」；这两个视图的数据都只精确到城市/国家质心，
// 放大到街道级无意义（只剩一个点、还看不到其它城市），故封顶 9（城市级）。
// 博客视图额外受益：聚合 effectiveMax 也随之=9，同坐标多站点全程聚合、点击稳定。
// 「我的足迹」是真实地点，需要钻到具体点位，故不限缩放。
const FOOTPRINT_MAX_ZOOM = 9;

// 三个视图的数据源按需加载：首屏只请求当前 tab，切到其它 tab 时再首次请求。
// TravelMap 内部仍只根据当前 places 重建聚合点、不重载地图。
// SPA 导航时挂起一个 fadeDuration，让旧页渐出完成后再挂载，避免左侧视图选择 tab 浮层
// （absolute，无 opacity:0 初始态）在 mainOpacity 过渡期间提前露脸闪烁。详见 useFadeOutOnNavigate。
await useFadeOutOnNavigate();

const fetchOptions = { headers: getInternalRequestHeaders() };
const {
  data: travelsData,
  pending: travelsPending,
  error: travelsError,
  execute: executeTravels,
} = await useFetch("/api/travels", {
  ...fetchOptions,
  immediate: view.value === "travels",
});
const {
  data: footprintData,
  pending: footprintPending,
  error: footprintError,
  execute: executeFootprint,
} = await useFetch("/api/footprint", {
  ...fetchOptions,
  immediate: view.value === "footprint",
});
const {
  data: blogData,
  pending: blogPending,
  error: blogError,
  execute: executeBlog,
} = await useFetch<BlogNetworkData>("/api/blog-network", {
  ...fetchOptions,
  immediate: view.value === "blogs",
});

watch(view, currentView => {
  if (currentView === "footprint") {
    if (!footprintData.value && !footprintPending.value) executeFootprint();
  } else if (currentView === "blogs") {
    if (!blogData.value && !blogPending.value) executeBlog();
  } else if (!travelsData.value && !travelsPending.value) {
    executeTravels();
  }
});

const travelPlaces = computed(() => travelsData.value?.data || []);

const cityCoordEntries = Object.entries(CITY_COORDS);

function nearestCityByCoord(longitude: number, latitude: number): string | null {
  // Number(null) === 0 会绕过 Number.isFinite 并把空坐标当 (0,0) 归到最近城市，污染省市统计；先显式判空
  if (longitude == null || latitude == null) return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  let nearest: string | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const [name, [lng, lat]] of cityCoordEntries) {
    const distance = (longitude - lng) ** 2 + (latitude - lat) ** 2;
    if (distance < minDistance) {
      minDistance = distance;
      nearest = name;
    }
  }

  return nearest;
}

// 统计已到访的省市数量：用坐标最近邻归到内置城市/省市质心，避免地点名不同导致“省市数=地点数”。
const travelProvinceStats = computed(() => {
  const provinces = new Set<string>();
  for (const p of travelPlaces.value) {
    const name = nearestCityByCoord(Number(p.longitude), Number(p.latitude));
    if (name) provinces.add(name);
  }
  return { provinces: provinces.size, places: travelPlaces.value.length };
});
const footprintStats = computed(() => footprintData.value?.data);
const footprintPlaces = computed(() =>
  (footprintStats.value?.points ?? []).map(p => ({
    id: p.id,
    name: p.name,
    desc: `${p.count} 位访客`,
    cover: null,
    longitude: p.longitude,
    latitude: p.latitude,
    contents: [],
    readers: p.readers ?? [],
  })),
);
const blogStats = computed(() => blogData.value?.data);
const blogPlaces = computed(() =>
  (blogStats.value?.points ?? []).map(p => ({
    id: p.id,
    name: p.name,
    desc: null,
    cover: null,
    longitude: p.longitude,
    latitude: p.latitude,
    contents: [],
    avatar: p.avatar,
    source: p.source,
    sourceId: p.sourceId,
    targetUrl: p.targetUrl,
    serverLocation: p.serverLocation,
    serverIsp: p.serverIsp,
  })),
);

// 当前视图的真实点集：切换 tab 时新视图数据未到（pending）会先为空数组
const currentPlaces = computed(() =>
  view.value === "footprint"
    ? footprintPlaces.value
    : view.value === "blogs"
      ? blogPlaces.value
      : travelPlaces.value,
);

const pending = computed(() =>
  view.value === "footprint"
    ? footprintPending.value
    : view.value === "blogs"
      ? blogPending.value
      : travelsPending.value,
);
const error = computed(() =>
  view.value === "footprint"
    ? footprintError.value
    : view.value === "blogs"
      ? blogError.value
      : travelsError.value,
);

// 地图组件自身的加载/失败状态（TravelMap 经 loading-change / error-change 上报）：
const mapLoading = ref(false);
const mapLoadError = ref(false);
// 递增 key 强制重挂载 TravelMap：地图初始化/加载失败时「点击重试」借此重新初始化 AMap 并重置失败态
const mapKey = ref(0);

// 地图加载失败重试：重置失败态 + 强制重挂载 TravelMap（仅刷新数据不会重新初始化地图）
function retryMap() {
  mapLoadError.value = false;
  mapKey.value++;
}

// 右下角状态行文字：加载中 / 地图加载中 / 各视图统计 / 空态。错误态单独用「点击重试」按钮展示，
// 不在 statusText 里拼文案（避免与按钮重复）。
const statusText = computed(() => {
  if (pending.value) return "加载中...";
  if (mapLoading.value) return "地图加载中...";
  if (view.value === "travels") {
    return travelProvinceStats.value.places > 0
      ? `已到访 ${travelProvinceStats.value.provinces} 个省市 · ${travelProvinceStats.value.places} 个地点`
      : "还没有任何足迹";
  }
  if (view.value === "footprint") {
    const stats = footprintStats.value;
    return stats
      ? stats.total > 0
        ? `共 ${stats.total} 位访客 · 海外 ${stats.overseas} · 未知 ${stats.unknown}`
        : "还没有访客足迹"
      : "";
  }
  if (view.value === "blogs") {
    const stats = blogStats.value;
    return stats
      ? stats.total > 0
        ? `共 ${stats.total} 个站点 · 海外 ${stats.overseas} · 未定位 ${stats.unknown}`
        : "还没有博客站点"
      : "";
  }
  return "";
});

// 最近一次非空 places 引用：tab 切换、新视图数据未到（pending）时用它顶住旧点，
// 避免地图上的点「短暂消失再跳变」。引用不变 → TravelMap 的 places watch 不触发、旧聚合不被销毁。
const lastNonEmptyPlaces = shallowRef<(typeof currentPlaces)["value"]>(
  [] as (typeof currentPlaces)["value"],
);
watch(
  currentPlaces,
  cp => {
    if (cp.length) lastNonEmptyPlaces.value = cp;
  },
  { immediate: true },
);

// 交给 TravelMap 的点集：加载中保持旧点（引用稳定），数据到位后整体替换触发重建聚合。
const places = computed(() =>
  pending.value && currentPlaces.value.length === 0 ? lastNonEmptyPlaces.value : currentPlaces.value,
);
const mapEverShown = ref(false);
watch(
  places,
  cp => {
    if (cp.length > 0) mapEverShown.value = true;
  },
  { immediate: true },
);
const shouldShowMap = computed(() => mapEverShown.value || places.value.length > 0);
// ?place 聚焦仅对「我的足迹」有意义
const focusId = computed(() => (view.value === "travels" ? (route.query.place as string) || null : null));

function setView(v: string) {
  // place 仅「我的足迹」视图用（见下方 focusId）；切 tab 时丢弃，避免 URL 残留 / 切回 travels 时误聚焦。
  const { place: _place, ...rest } = route.query;
  router.push({ query: { ...rest, view: v } });
}

// tab 切换加载失败后重试当前视图：useFetch execute 会重置 error、置 pending，走正常加载流程。
function retryCurrentView() {
  if (view.value === "footprint") executeFootprint();
  else if (view.value === "blogs") executeBlog();
  else executeTravels();
}

const viewTitleMap: Record<string, string> = {
  travels: "我的足迹",
  footprint: "访客分布",
  blogs: "博客网络",
};

usePageSeo({
  title: computed(() => {
    const viewLabel = viewTitleMap[view.value] || "地图";
    const placeName = route.query.place
      ? travelPlaces.value.find(p => String(p.id) === String(route.query.place))?.name
      : null;
    return placeName ? `${placeName} - ${viewLabel} - ${siteName.value}` : `${viewLabel} - ${siteName.value}`;
  }),
  description: siteConfig.pageSeo.map.description,
  keywords: siteConfig.pageSeo.map.keywords,
});

// 地图仍参与文档流，避免 fixed 脱流导致页面折叠。
// 高度铺满 100svh，再用负 margin-bottom 抵消 main 的 pb-10 和透明页脚高度，
// 让页脚覆盖在地图底部区域上，同时不产生额外滚动。
const footerH = ref(0);
const sectionStyle = computed(() => ({
  marginBottom: `calc(-${footerH.value}px - 2.5rem)`,
}));
let resizeObserver: ResizeObserver | null = null;
let resizeHandler: (() => void) | null = null;

onMounted(() => {
  isHydrated.value = true;
  const mainEl = document.getElementById("main");
  const footerEl = mainEl?.nextElementSibling as HTMLElement | null;

  const measure = () => {
    footerH.value = footerEl ? footerEl.offsetHeight : 0;
  };
  measure();

  if (footerEl && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(footerEl);
  }
  resizeHandler = measure;
  window.addEventListener("resize", resizeHandler);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
});
</script>

<template>
  <section class="relative -mt-20 -mx-5 h-svh overflow-hidden bg-gray-100 dark:bg-gray-900" :style="sectionStyle">
    <!-- 地图主体：不再居中遮罩，加载中/地图加载中/失败/空态统一由右下角状态行小字提示。
         TravelMap 的加载与错误状态经 loading-change / error-change 上报到本页状态行。 -->
    <ClientOnly v-if="shouldShowMap">
      <TravelMap
        :key="mapKey"
        :places="places"
        :focus-id="focusId"
        :max-zoom="view === 'footprint' || view === 'blogs' ? FOOTPRINT_MAX_ZOOM : undefined"
        @loading-change="mapLoading = $event"
        @error-change="mapLoadError = $event" />
      <template #fallback>
        <div class="w-full h-full bg-gray-100 dark:bg-gray-900 animate-pulse" />
      </template>
    </ClientOnly>

    <!-- 左侧浮层：视图选择器（毛玻璃，复用 SiteHeader 的 frosted 样式） -->
    <div class="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 sm:left-6">
      <div
        class="pointer-events-auto flex flex-col gap-1 rounded-2xl p-1.5 shadow-[0_8px_16px_-4px_rgba(44,45,48,0.047)] backdrop-blur-[20px] bg-linear-to-b from-white/60 to-white/85 dark:from-black/60 dark:to-black/85">
        <button
          v-for="opt in viewOptions"
          :key="opt.value"
          type="button"
          class="flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition-colors sm:justify-start sm:px-3 cursor-pointer"
          :class="
            view === opt.value
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10'
          "
          @click="setView(opt.value)">
          <Icon :name="opt.icon" class="size-4" />
          <span class="hidden sm:inline">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div
      class="pointer-events-none absolute left-21 bottom-1 z-10 text-xs leading-none text-slate-700/80 dark:text-slate-300/80"
      :style="{ bottom: `${footerH + 6}px` }">
      {{ currentYear }}@{{ siteName }}
    </div>

    <!-- 右下角状态行：统计 / 加载中 / 地图加载中 / 加载失败（可点重试）/ 空态，统一小字一行，不用遮罩 -->
    <div
      class="pointer-events-none absolute right-2 z-20 flex items-end gap-1.5 text-[10px] leading-none text-slate-700 dark:text-slate-200"
      :style="{ bottom: `${footerH + 4}px` }">
      <!-- 已登录：前往后台编辑足迹（外层 pointer-events-none 不挡地图，链接单独可点） -->
      <ClientOnly>
        <NuxtLink
          v-if="isLoggedIn && view === 'travels' && travelProvinceStats.places > 0"
          to="/admin/travels"
          target="_blank"
          class="pointer-events-auto inline-flex items-center gap-1 font-medium text-slate-700 hover:text-blue-600">
          <Icon name="ri:edit-line" class="size-3" />
          编辑足迹
        </NuxtLink>
      </ClientOnly>
      <button
        v-if="error"
        type="button"
        class="pointer-events-auto inline-flex cursor-pointer items-center gap-1 hover:underline"
        @click="retryCurrentView">
        <Icon name="ri:refresh-line" class="size-3" />
        加载失败，点击重试
      </button>
      <button
        v-else-if="mapLoadError"
        type="button"
        class="pointer-events-auto inline-flex cursor-pointer items-center gap-1 hover:underline"
        @click="retryMap">
        <Icon name="ri:refresh-line" class="size-3" />
        地图加载失败，点击重试
      </button>
      <span v-else-if="statusText">{{ statusText }}</span>
    </div>
  </section>
</template>
