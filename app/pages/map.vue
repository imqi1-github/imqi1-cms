<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { siteConfig } from "~~/site.config";

const { siteSettings } = useSiteSettings();
const { isLoggedIn } = useAuth();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const currentYear = new Date().getFullYear();

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

// 两视图各自的数据源；切视图只是换 places，TravelMap 内部重建聚合点、不重载地图
const { data: travelsData, pending: travelsPending, error: travelsError } = await useFetch("/api/travels", {
  headers: { "x-ssr-internal-request": "true" },
});
const { data: footprintData, pending: footprintPending, error: footprintError } = await useFetch("/api/footprint", {
  headers: { "x-ssr-internal-request": "true" },
});
const { data: blogData, pending: blogPending, error: blogError } = await useFetch<{
  data?: {
    points: Array<{
      id: number;
      name: string;
      avatar: string | null;
      longitude: number;
      latitude: number;
      source: "subscribe" | "link";
      sourceId: number;
      targetUrl: string | null;
    }>;
    overseas: number;
    unknown: number;
    total: number;
  };
}>("/api/blog-network", {
  headers: { "x-ssr-internal-request": "true" },
});

const travelPlaces = computed(() => travelsData.value?.data || []);

// 统计已到访的省市数量：从 name 中提取省市部分（格式如"浙江·杭州"取"浙江"，"北京"取"北京"）
const travelProvinceStats = computed(() => {
  const provinces = new Set<string>();
  for (const p of travelPlaces.value) {
    const name = p.name || "";
    // 如果有分隔符（如 · ），取第一部分作为省/直辖市
    const province = name.includes("·") ? name.split("·")[0]! : name;
    provinces.add(province);
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
    posts: [],
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
    posts: [],
    avatar: p.avatar,
    source: p.source,
    sourceId: p.sourceId,
    targetUrl: p.targetUrl,
  })),
);

const places = computed(() =>
  view.value === "footprint"
    ? footprintPlaces.value
    : view.value === "blogs"
      ? blogPlaces.value
      : travelPlaces.value,
);
// ?place 聚焦仅对「我的足迹」有意义
const focusId = computed(() => (view.value === "travels" ? (route.query.place as string) || null : null));

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

function setView(v: string) {
  // place 仅「我的足迹」视图用（见下方 focusId）；切 tab 时丢弃，避免 URL 残留 / 切回 travels 时误聚焦。
  const { place: _place, ...rest } = route.query;
  router.replace({ query: { ...rest, view: v } });
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
    <!-- 地图主体 -->
    <div v-if="pending" class="absolute inset-0 flex items-center justify-center">
      <div class="text-center text-white">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        <p class="mt-3">加载中...</p>
      </div>
    </div>
    <div v-else-if="error" class="absolute inset-0 flex items-center justify-center">
      <div class="text-center text-white">
        <Icon name="ri:error-warning-line" class="size-8 mx-auto mb-2" />
        <p>加载失败，请刷新重试</p>
      </div>
    </div>
    <div v-else-if="places.length === 0" class="absolute inset-0 flex items-center justify-center">
      <div class="text-center text-gray-300 dark:text-white/90">
        <Icon name="ri:map-pin-line" class="size-12 mx-auto mb-4 opacity-70" />
        <p>{{ view === "footprint" ? "还没有访客足迹" : view === "blogs" ? "还没有博客站点" : "还没有任何足迹" }}</p>
      </div>
    </div>

    <ClientOnly v-else>
      <TravelMap :places="places" :focus-id="focusId" :max-zoom="view === 'footprint' || view === 'blogs' ? FOOTPRINT_MAX_ZOOM : undefined" />
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
          class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors"
          :class="
            view === opt.value
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10'
          "
          @click="setView(opt.value)">
          <Icon :name="opt.icon" class="size-4" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div
      class="pointer-events-none absolute left-21 bottom-1 z-10 text-xs leading-none text-slate-700/80 dark:text-slate-300/80"
      :style="{ bottom: `${footerH + 6}px` }">
      {{ currentYear }}@{{ siteName }}
    </div>

    <!-- 右下浮层：我的足迹统计（仅 travels 视图） -->
    <div
      v-if="view === 'travels' && travelProvinceStats.places > 0"
      class="pointer-events-none absolute right-2 z-20 flex flex-col items-end gap-1.5"
      :style="{ bottom: `${footerH + 4}px` }">
      <div class="text-[10px] text-slate-700 dark:text-slate-200">
        已到访 {{ travelProvinceStats.provinces }} 个省市 · {{ travelProvinceStats.places }} 个地点
      </div>
      <!-- 已登录：前往后台编辑足迹（外层 pointer-events-none 不挡地图，按钮单独可点） -->
      <ClientOnly>
        <NuxtLink
          v-if="isLoggedIn"
          to="/admin/travels"
          target="_blank"
          class="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-linear-to-b from-white/60 to-white/85 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow backdrop-blur-[20px] transition-colors hover:text-blue-600 dark:from-black/60 dark:to-black/85 dark:text-slate-200 dark:hover:text-blue-400">
          <Icon name="ri:edit-line" class="size-3" />
          编辑足迹
        </NuxtLink>
      </ClientOnly>
    </div>

    <!-- 右下浮层：访客分布统计（仅 footprint 视图）。避让顶栏导航：用 footerH 把它顶到页脚之上，
         不会落在页脚背后或被 z-50 导航遮挡。 -->
    <div
      v-if="view === 'footprint' && footprintStats"
      class="pointer-events-none absolute right-2 z-20"
      :style="{ bottom: `${footerH + 4}px` }">
      <div
        class="text-[10px] text-slate-700 dark:text-slate-200">
        共 {{ footprintStats.total }} 位访客 · 海外 {{ footprintStats.overseas }} · 未知 {{ footprintStats.unknown }}
      </div>
    </div>

    <!-- 右下浮层：博客网络统计（仅 blogs 视图） -->
    <div
      v-if="view === 'blogs' && blogStats"
      class="pointer-events-none absolute right-2 z-20"
      :style="{ bottom: `${footerH + 4}px` }">
      <div class="text-[10px] text-slate-700 dark:text-slate-200">
        共 {{ blogStats.total }} 个站点 · 海外 {{ blogStats.overseas }} · 未定位 {{ blogStats.unknown }}
      </div>
    </div>
  </section>
</template>
