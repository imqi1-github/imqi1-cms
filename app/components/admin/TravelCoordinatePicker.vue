<script setup lang="ts">
import {loadAmap, resolveAmapClientConfig} from "~/utils/amap-loader";
import type {
  AMapMapEvent,
  AMapMapInstance,
  AMapNamespace,
  LngLatInput,
  LngLatTuple
} from "~/types/components/map";

const props = defineProps<{
  longitude: string | number | null;
  latitude: string | number | null;
}>();

const emit = defineEmits<{
  "update:longitude": [value: string];
  "update:latitude": [value: string];
}>();

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const mapEl = ref<HTMLElement | null>(null);
const loading = ref(true);
const loadError = ref(false);

let _amap: AMapNamespace | null = null;
let map: AMapMapInstance | null = null;
let marker: AMap.Marker | null = null;
let updatingFromPicker = false;
// loading 兜底 setTimeout 句柄 —— 卸载时取消，避免写 loading ref / 在销毁的地图上 scheduleResize
let loadingFallbackTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeLngLat(value: LngLatInput): LngLatTuple | null {
  if (Array.isArray(value)) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return isValidLngLat(lng, lat) ? [lng, lat] : null;
  }

  if (value && "getLng" in value && "getLat" in value) {
    const lng = Number(value.getLng() ?? value.lng);
    const lat = Number(value.getLat() ?? value.lat);
    return isValidLngLat(lng, lat) ? [lng, lat] : null;
  }

  return null;
}

function isValidLngLat(lng: number, lat: number) {
  return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function formLngLat(): LngLatTuple | null {
  const lngValue = typeof props.longitude === "string" ? props.longitude.trim() : props.longitude;
  const latValue = typeof props.latitude === "string" ? props.latitude.trim() : props.latitude;

  if (lngValue === "" || latValue === "" || lngValue == null || latValue == null) return null;

  const lng = Number(lngValue);
  const lat = Number(latValue);
  return isValidLngLat(lng, lat) ? [lng, lat] : null;
}

function formatCoord(value: number) {
  return value.toFixed(6);
}

function markerHtml() {
  return `<div style="position:relative;width:32px;height:38px;">
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="38" viewBox="0 0 24 24" style="color:#3971ec">
      <path fill="currentColor" d="M18.364 17.364L12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
    </svg>
  </div>`;
}

const selectedCoordText = computed(() => {
  const lnglat = formLngLat();
  return lnglat ? `当前坐标：${formatCoord(lnglat[0])}, ${formatCoord(lnglat[1])}` : "点击地图选择位置，也可以手动输入经纬度";
});

function scheduleResize() {
  nextTick(() => {
    window.setTimeout(() => map?.resize?.(), 60);
    window.setTimeout(() => map?.resize?.(), 260);
  });
}

function ensureMarker(lnglat: LngLatTuple) {
  if (!AMap || !map) return;

  if (!marker) {
    marker = new AMap.Marker({
      position: lnglat,
      content: markerHtml(),
      offset: new AMap.Pixel(-16, -38),
      draggable: true,
      cursor: "move",
      map,
    });

    marker.on("dragend", (event: AMapMapEvent) => {
      selectLngLat(event.lnglat, false);
    });
  } else {
    marker.setPosition(lnglat);
  }
}

function clearMarker() {
  if (!marker) return;
  marker.setMap(null);
  marker = null;
}

function syncMarkerFromProps() {
  if (!map) return;

  const lnglat = formLngLat();
  if (!lnglat) {
    clearMarker();
    return;
  }

  ensureMarker(lnglat);
  map.setCenter(lnglat);
  if ((map.getZoom?.() || 4) < 10) {
    map.setZoom(13);
  }
}

function selectLngLat(value: LngLatInput, moveCenter = true) {
  const lnglat = normalizeLngLat(value);
  if (!lnglat || !map) return;

  ensureMarker(lnglat);
  if (moveCenter) {
    map.setZoomAndCenter(Math.max(map.getZoom?.() || 4, 13), lnglat);
  }

  updatingFromPicker = true;
  emit("update:longitude", formatCoord(lnglat[0]));
  emit("update:latitude", formatCoord(lnglat[1]));
  window.setTimeout(() => {
    updatingFromPicker = false;
  }, 0);
}

onMounted(async () => {
  // key/securityCode 运行时获取（不烘焙进包）：代理模式返回空 key（由 /_AMapService 注入），
  // 直连模式从 /api/amap/config 下发。生产/开发运行时补配 AMAP_KEY / AMAP_SECURITY_CODE 即可生效。
  const { useProxy: amapUseProxy, key: amapKey, securityJsCode: amapSecurityCode } = await resolveAmapClientConfig();
  if (!mapEl.value || (!amapUseProxy && (!amapKey || !amapSecurityCode))) {
    loadError.value = true;
    loading.value = false;
    if (!amapUseProxy && (!amapKey || !amapSecurityCode)) {
      console.warn("[TravelCoordinatePicker] 地图未启用：缺少 AMAP_KEY / AMAP_SECURITY_CODE。直连模式需在运行环境（开发/生产）设置这两个变量。");
    }
    return;
  }

  try {
    _amap = await loadAmap({
      version: "2.0",
      useProxy: amapUseProxy,
      key: amapKey,
      securityJsCode: amapSecurityCode,
    });

    if (!_amap) throw new Error("高德地图加载失败");

    const initialLngLat = formLngLat();
    const initDark = document.documentElement.classList.contains("dark");
    map = new _amap.Map(mapEl.value as HTMLDivElement, {
      zoom: initialLngLat ? 13 : 4,
      center: initialLngLat || [104, 35],
      viewMode: "2D",
      mapStyle: initDark ? "amap://styles/dark" : "amap://styles/whitesmoke",
    });

    // 初次建 marker 要等底图 complete（瓦片/样式渲染完成）后再做：
    // 底图渲染管线未就绪时创建的 marker 会被推迟到地图首个渲染周期才画，
    // 导致「底图先出、marker 后冒出」。统一在 complete 回调里建 marker + 撤遮罩，
    // 让 marker 与底图同一周期画出、一起出现。兜底 timer 与 complete 走同一幂等 init。
    let initialRenderDone = false;
    const finishInitialRender = () => {
      if (initialRenderDone) return;
      initialRenderDone = true;
      if (loadingFallbackTimer) {
        clearTimeout(loadingFallbackTimer);
        loadingFallbackTimer = null;
      }
      if (initialLngLat) {
        ensureMarker(initialLngLat);
      }
      loading.value = false;
      scheduleResize();
    };
    map.on("complete", finishInitialRender);
    map.on("click", (event: AMapMapEvent) => {
      selectLngLat(event.lnglat);
    });

    loadingFallbackTimer = setTimeout(finishInitialRender, 3000);
    scheduleResize();
  } catch (error) {
    console.error("[TravelCoordinatePicker] 地图加载失败:", error);
    loadError.value = true;
    loading.value = false;
  }
});

watch(isDark, dark => {
  if (!map) return;
  map.setMapStyle(dark ? "amap://styles/dark" : "amap://styles/whitesmoke");
});

watch(
  () => [props.longitude, props.latitude],
  () => {
    if (updatingFromPicker) return;
    syncMarkerFromProps();
  },
);

onUnmounted(() => {
  if (loadingFallbackTimer) {
    clearTimeout(loadingFallbackTimer);
    loadingFallbackTimer = null;
  }
  if (map) {
    map.destroy();
    map = null;
  }
  marker = null;
  _amap = null;
});
</script>

<template>
  <div class="space-y-2">
    <div class="relative h-48 sm:h-72 overflow-hidden rounded-md border bg-muted">
      <div ref="mapEl" class="travel-coordinate-picker-map h-full w-full"/>

      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-muted">
        <div class="text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"/>
          <p class="mt-2 text-sm text-muted-foreground">地图加载中...</p>
        </div>
      </div>

      <div v-if="loadError" class="absolute inset-0 flex items-center justify-center bg-muted/95 p-6">
        <div class="text-center">
          <Icon name="ri:map-pin-line" class="size-10 text-muted-foreground/60 mx-auto mb-2" />
          <p class="font-medium">地图加载失败</p>
          <p class="text-xs text-muted-foreground mt-1">可继续手动填写经纬度</p>
        </div>
      </div>
    </div>

    <p class="text-xs text-muted-foreground">{{ selectedCoordText }}</p>
  </div>
</template>

<style scoped>
.travel-coordinate-picker-map,
.travel-coordinate-picker-map :deep(.amap-container),
.travel-coordinate-picker-map :deep(.amap-marker),
.travel-coordinate-picker-map :deep(.amap-copyright),
.travel-coordinate-picker-map :deep(.amap-logo),
.travel-coordinate-picker-map :deep(.amap-control),
.travel-coordinate-picker-map :deep(.amap-scalecontrol),
.travel-coordinate-picker-map :deep(.amap-toolbar),
.travel-coordinate-picker-map :deep(.amap-ui-control) {
  font-family: "Noto Serif SC", serif !important;
}

:global(.dark) .travel-coordinate-picker-map {
  background-color: #111827 !important;
}
</style>
