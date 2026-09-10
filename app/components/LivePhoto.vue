<script lang="ts">
// 模块级 IntersectionObserver 单例：跨 LivePhoto 实例共享（原在 setup 内每实例各建一个，
// N 张图 N 个 observer，与注释"全局共享"相悖）。单客户端 bundle，无 app/nitro 双实例坑。
let lazyObserver: IntersectionObserver | null = null;
</script>

<script setup lang="ts">
// 模块级单例 lazyObserver 在上方 <script> 块，导入被 import/first 视为越序（SFC 双 script 块的已知误报），保持单例不动。
/* eslint-disable import/first */
import {type CSSProperties, onMounted, ref, useAttrs} from "vue";
import {useMediaQuery} from "@vueuse/core";

import {useLivePhoto} from "~/composables/useLivePhoto";
import type {LivePhotoElement, LivePhotoProps} from "~/types/components/live-photo";

// 禁用自动属性继承，手动控制属性传递
defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<LivePhotoProps>(),
  {
    hoverPlay: true,
    lazy: true,
    showPlaceholder: true,
  },
);

const attrs = useAttrs();

const mediaAspectRatio = computed(() => {
  if (props.aspectRatio) return props.aspectRatio;

  const width = props.width;
  const height = props.height;
  return width && height ? `${width} / ${height}` : undefined;
});

// 过滤出灯箱相关属性（data-* / id / title / loading），只传给 img
const lightboxAttrs = computed(() => {
  const result: Record<string, string> = {};
  (Object.keys(attrs) as Array<keyof typeof attrs>).forEach(key => {
    if (key.startsWith("data-") || key === "id" || key === "title" || key === "loading") {
      result[key] = attrs[key] as string;
    }
  });
  // 标记实况照片，供灯箱识别后在灯箱内提供实况视频播放。
  // 用 isLive 而非 includes("#live")：与 cleanLivePhotoUrl 统一为「末尾匹配」语义
  if (isLive.value) {
    result["data-live-photo"] = "";
  }
  return result;
});

const imageAttrs = computed(() => ({
  ...lightboxAttrs.value,
}));

const { extractLivePhotoMedia, isLivePhoto, cleanLivePhotoUrl } = useLivePhoto();

// 状态
const imgRef = ref<HTMLImageElement | null>(null);
const videoBlobUrl = ref<string | null>(null);
const imageBlobUrl = ref<string | null>(null);
const isPlaying = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const wrapperRef = ref<HTMLDivElement | null>(null);
const imageNaturalWidth = ref<number | null>(null);
const imageNaturalHeight = ref<number | null>(null);
const imageFitMode = ref<"width" | "height" | "scale">("scale");
const isHovering = ref(false);
// 实况照片资源提取耗时较长时显示加载标识，避免用户误以为卡住
const isLiveMediaLoading = ref(false);
const showLiveLoadingTip = ref(false);
// 视频层在提取完成后常驻挂载并预载解码，但置于图片层之下（模板里 <video> 在 <img> 之前，
// 且 <img> 加了 relative 压在其上）：非交互时被不透明图片完整盖住，未解码首帧的视频层
// 即使被浏览器在 GPU 合成路径下合成成白色矩形也看不见 → 不触发”白色矩形盖住静态图”白屏。
// 悬浮/点击时靠图片淡出（imgOpacity 100→0）把已就绪的视频”露”出来，形成渐变。
// 视频一直在 DOM 里，切换无需重新挂载/等首帧。

// 移动端判定：移动端无 hover 事件，需要强制切换为点击播放模式并让按钮常驻
const isMobile = useMediaQuery("(max-width: 768px)");
// 实际生效的悬浮播放模式：移动端无论 props.hoverPlay 为何，都不走 hover 自动播放
const effectiveHoverPlay = computed(() => props.hoverPlay && !isMobile.value);

// 图片透明度：非交互 100，悬浮/播放时淡出到 0 露出下层视频（视频层本身不控制透明度，
// 可见性完全由压在其上的图片决定）
const imgOpacity = ref(100);

// 清理后的图片 URL
const cleanSrc = computed(() => cleanLivePhotoUrl(props.src));

// 是否为实况照片
const isLive = computed(() => isLivePhoto(props.src));

const liveImageAttrs = computed(() => ({
  ...imageAttrs.value,
  "data-live-photo-src": cleanSrc.value,
}));

// ✅ 懒加载状态：是否已经开始加载（实况照片也走视口懒加载，进视口才提取视频，避免图片页一堆视频同时 fetch+解码）
const shouldLoad = ref<boolean>(!props.lazy);
// ✅ 图片是否已解码完成：占位 3/4 宽高比保留到图片真正 load 后才 unset，
// 避免 shouldLoad 一变真就把占位高度清掉、图片字节未到时高度先塌成 0 再弹回真实高度的二次回流
const loaded = ref(false);
// ✅ 普通图片加载完成：置 loaded=true 解除占位宽高比、淡入显示。
// 注意：不能在内联模板处理器里写 loaded.value = true —— 模板会自动解包 ref，
// 编译后变成 false.value = true 报 "Cannot create property 'value' on boolean"，
// 故在 script 里定义为方法再绑到 @load。
const onImageLoaded = (e: Event) => {
  loaded.value = true;
  (e.target as HTMLImageElement).classList.add("opacity-100");
};
// 非实况图片加载失败(404/网络)：置 loaded 让占位/骨架撤掉、并把 img 转为可见，
// 否则 loaded 恒 false → 骨架(pulse)或 opacity-0 永久空白/破图不可见。
const onImageError = (e: Event) => {
  loaded.value = true;
  (e.target as HTMLImageElement).classList.add("opacity-100");
};
// ✅ IntersectionObserver 单例：已提升到模块级（见文件顶部 <script>），跨实例共享

// 实际加载的 src：懒加载时只有在可见后才设置
const actualSrc = computed(() => {
  if (!shouldLoad.value) return '';
  return isLive.value ? cleanSrc.value : props.src;
});

// 初始化懒加载监听
const initLazyLoading = (el: LivePhotoElement) => {
  if (!props.lazy) return;

  if (!('IntersectionObserver' in window)) {
    // 浏览器不支持，直接加载
    shouldLoad.value = true;
    return;
  }

  if (!lazyObserver) {
    // 创建全局共享的 observer，提前 300px 开始加载
    lazyObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          // 进入视口，开始加载
          const img = entry.target as LivePhotoElement;
          lazyObserver!.unobserve(img);
          img.__livePhotoLoadCallback?.();
        }
      }
    }, {
      rootMargin: '300px 0px', // 提前 300px 开始加载，用户滚动到的时候已经加载好
      threshold: 0.01,
    });
  }

  // 存储加载回调，observer 触发时调用
  el.__livePhotoLoadCallback = () => {
    shouldLoad.value = true;
  };

  lazyObserver.observe(el);
};

// 计算包裹容器的样式
const wrapperStyle = computed(() => {
  const baseStyle: CSSProperties = {};
  if (mediaAspectRatio.value) {
    baseStyle.aspectRatio = mediaAspectRatio.value;
  }

  // 如果是轮播图中的图片（有 swiper-img 类），宽度交给 aspect-ratio + 容器高度推导，避免写入固定像素宽高
  if (props.class?.includes("swiper-img")) {
    return {
      ...baseStyle,
      height: "100%",
    };
  }

  return baseStyle;
});

// 计算图片/视频的样式
const mediaStyle = computed<CSSProperties>(() => {
  if (!props.class?.includes("swiper-img")) return {};

  return {
    objectFit: "cover",
  };
});

// 释放当前实况照片 Blob URL
const revokeLiveMedia = () => {
  if (imageBlobUrl.value) {
    URL.revokeObjectURL(imageBlobUrl.value);
    imageBlobUrl.value = null;
  }

  if (videoBlobUrl.value) {
    URL.revokeObjectURL(videoBlobUrl.value);
    videoBlobUrl.value = null;
  }
};

// 标记组件是否已卸载
let isUnmounted = false;
// ✅ 用于取消实况视频提取请求
let extractAbortController: AbortController | null = null;
let liveLoadingTipTimer: number | null = null;
// 保存 observer 引用用于卸载
let observedElement: LivePhotoElement | null = null;

const clearLiveLoadingTipTimer = () => {
  if (liveLoadingTipTimer !== null) {
    clearTimeout(liveLoadingTipTimer);
    liveLoadingTipTimer = null;
  }
};

const stopLiveMediaLoading = () => {
  clearLiveLoadingTipTimer();
  isLiveMediaLoading.value = false;
  showLiveLoadingTip.value = false;
};

// 获取图片自然宽高并计算填充模式
const calculateFitMode = () => {
  // ✅ 检查组件是否已卸载或 DOM 是否存在
  if (isUnmounted || !imgRef.value || !props.class?.includes("swiper-img")) return;

  const naturalWidth = imgRef.value.naturalWidth;
  const naturalHeight = imgRef.value.naturalHeight;
  imageNaturalWidth.value = naturalWidth;
  imageNaturalHeight.value = naturalHeight;

  // 假设容器的高度是固定的（轮播图的高度）
  // swiper-wrapper 的高度是 650px 或 350px（响应式）
  // 我们需要根据图片和容器的宽高比来决定填充方式

  // 获取容器高度（从 swiper-wrapper）
  const swiperWrapper = wrapperRef.value?.closest(".swiper-wrapper");
  if (swiperWrapper) {
    const containerHeight = swiperWrapper.clientHeight || 650; // 默认 650px
    const containerWidth = containerHeight; // 容器是正方形或接近正方形

    const imageRatio = naturalWidth / naturalHeight;
    const containerRatio = containerWidth / containerHeight;

    // 判断填充模式
    if (imageRatio > containerRatio) {
      imageFitMode.value = "height";
    } else if (imageRatio < containerRatio) {
      // 图片更高 → 宽度不够 → 宽度100%
      imageFitMode.value = "width";
    } else {
      // 比例相同 → 都小于容器，需要缩放
      imageFitMode.value = "scale";
    }
  }
};

const onLiveImageLoaded = () => {
  loaded.value = true;
  calculateFitMode();
};

// 初始化实况照片
onMounted(async () => {
  // ✅ 初始化懒加载
  if (wrapperRef.value) {
    observedElement = wrapperRef.value;
    initLazyLoading(wrapperRef.value);
  } else if (imgRef.value) {
    observedElement = imgRef.value;
    initLazyLoading(imgRef.value);
  }

  if (!isLive.value || !imgRef.value) {
    return;
  }

  // 监听图片加载
  if (imgRef.value.complete) {
    // 图片已经加载完成
    calculateFitMode();
  } else {
    // 等待图片加载完成
    imgRef.value.onload = calculateFitMode;
  }
});

// 提取实况媒体：懒加载下等进入视口（shouldLoad 为真）再请求，避免图片页一堆视频同时 fetch+解码
watch([shouldLoad, cleanSrc], async ([ready, src]) => {
  if (!import.meta.client || !ready || !isLive.value || isUnmounted) return;

  // ✅ 创建 AbortController 用于快速切页时取消请求
  extractAbortController?.abort();
  extractAbortController = new AbortController();
  const currentController = extractAbortController;

  revokeLiveMedia();
  clearLiveLoadingTipTimer();
  isLiveMediaLoading.value = true;
  showLiveLoadingTip.value = false;
  liveLoadingTipTimer = window.setTimeout(() => {
    if (isLiveMediaLoading.value && !isUnmounted) {
      showLiveLoadingTip.value = true;
    }
  }, 300);

  const media = await extractLivePhotoMedia(src, currentController.signal);

  // ✅ 异步操作后检查
  if (isUnmounted || currentController.signal.aborted || cleanSrc.value !== src) {
    if (media.imageUrl) URL.revokeObjectURL(media.imageUrl);
    if (media.videoUrl) URL.revokeObjectURL(media.videoUrl);
    return;
  }

  stopLiveMediaLoading();

  imageBlobUrl.value = media.imageUrl;
  videoBlobUrl.value = media.videoUrl;
  extractAbortController = null;
}, { immediate: true });

// 存储定时器 ID，用于清除
let resetTimer: number | null = null;

/**
 * 等视频首帧可解码显示（readyState≥2 或 loadeddata/canplay 事件）。
 * 视频层已常驻挂载，绝大多数情况 readyState≥2 直接放行；仅当用户悬浮/点击发生在
 * 首帧解码完成之前（极少）才短暂等待，避免图片淡出后露出的还是空白、再突兀弹出首帧。
 * 解码失败（如 Firefox 不解 HEVC）也 resolve，由调用方对 `!videoRef.value` 的守卫兜底。
 */
function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve(); // HAVE_CURRENT_DATA：首帧已就绪
  return new Promise(resolve => {
    let timer: number | null = null;
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onReady);
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onReady);
    timer = window.setTimeout(onReady, 2000); // 长时间无事件也继续，避免悬浮后视频永不显示
  });
}

// 鼠标悬浮 - 播放视频（仅悬浮播放模式）
const handleMouseEnter = async () => {
  isHovering.value = true; // 标记悬浮状态

  if (!effectiveHoverPlay.value) return; // 点击播放模式不处理悬浮

  // 检查是否有视频 URL
  if (!videoBlobUrl.value) {
    return;
  }

  // 清除之前可能残留的重置定时器
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // 视频层提取完成后已常驻挂载在图片层之下；若首帧还没解码完（极少）则稍等一下，
  // 避免图片淡出后露出的还是空白、首帧再突兀弹出（readyState≥2 直接放行）
  const videoEl = videoRef.value;
  if (isUnmounted || !videoEl) {
    return;
  }
  await waitForVideoReady(videoEl);

  // ✅ 等待期间可能移出/卸载：组件已卸载、DOM 已卸载或鼠标已移开，则不再淡入
  if (isUnmounted || !videoRef.value || !isHovering.value) {
    return;
  }

  // 先设置视频到开头
  videoRef.value.currentTime = 0;

  // 交叉淡入淡出：图片淡出（100 -> 0），把下面已就绪的视频"露"出来
  imgOpacity.value = 0;

  // 开始播放视频
  videoRef.value
    .play()
    .then(() => {
      // ✅ 异步回调中也检查组件状态
      if (!isUnmounted) {
        isPlaying.value = true;
      }
    })
    .catch(() => {
      // ✅ 异步回调中也检查组件状态
      if (!isUnmounted) {
        // 播放失败时恢复显示图片
        imgOpacity.value = 100;
        isPlaying.value = false;
      }
    });
};

// 鼠标移开 - 恢复显示图片（仅悬浮播放模式）
const handleMouseLeave = () => {
  isHovering.value = false; // 标记悬浮结束

  if (!effectiveHoverPlay.value) return; // 点击播放模式不处理悬浮

  if (!videoRef.value) return;

  // 清除可能残留的重置定时器
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // 交叉淡入淡出：图片淡回（0 -> 100）盖住视频，暂停并重置进度
  imgOpacity.value = 100;
  videoRef.value.pause();
  isPlaying.value = false;

  resetTimer = window.setTimeout(() => {
    if (videoRef.value) {
      videoRef.value.currentTime = 0;
    }
  }, 150); // 等待过渡完成后重置

  // 视频常驻挂载在图片层之下，无需卸载
};

// 点击播放/暂停（点击播放模式）
const handlePlayClick = async () => {
  if (effectiveHoverPlay.value) return; // 悬浮播放模式不处理点击

  if (!videoBlobUrl.value) return;

  // 清除可能残留的重置定时器
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  if (!videoRef.value) return;

  if (isPlaying.value) {
    // 暂停：图片淡回（0 -> 100）盖住视频
    imgOpacity.value = 100;
    videoRef.value.pause();
    isPlaying.value = false;
  } else {
    // 播放：视频已常驻预载，首帧未就绪则稍等（readyState≥2 直接放行）
    await waitForVideoReady(videoRef.value);
    if (!videoRef.value) return;
    videoRef.value.currentTime = 0;
    // 图片淡出（100 -> 0）露出下层视频
    imgOpacity.value = 0;
    videoRef.value
      .play()
      .then(() => {
        isPlaying.value = true;
      })
      .catch(err => {
        console.error("[LivePhoto] 视频播放失败:", err);
        imgOpacity.value = 100;
        isPlaying.value = false;
      });
  }
};

// 视频播放结束
const onVideoEnded = () => {
  // 视频播放结束后自动暂停并显示图片（图片淡回盖住视频）
  if (videoRef.value && isPlaying.value) {
    imgOpacity.value = 100;
    videoRef.value.pause();
    isPlaying.value = false;
    // 视频常驻挂载在图片层之下，无需卸载
  }
};

// 视频加载/解码失败兜底：原始 iPhone 实况照片视频段多为 HEVC，上传未转码时
// Firefox（默认不解 HEVC）会在 metadata 阶段派发 error（NS_ERROR_DOM_MEDIA_METADATA_ERR）。
// 此时静默退化为静态图——清掉 videoBlobUrl 让 video/实况标识/播放按钮一并 v-if 隐藏，
// 避免“点了没反应”与浏览器 media error 的连锁报错。Chrome 等支持 HEVC 的环境不触发。
const onVideoError = () => {
  if (isUnmounted) return;
  console.warn("[LivePhoto] 视频解码失败，已退化为静态图（浏览器可能不支持该编码，如 HEVC）");
  if (videoBlobUrl.value) {
    URL.revokeObjectURL(videoBlobUrl.value);
    videoBlobUrl.value = null; // 触发 <video> v-if 卸载，退化为静态图
  }
  imgOpacity.value = 100;
  isPlaying.value = false;
};

// 播放按钮可见性：
// - 移动端：播放中隐藏，其余时间常驻显示（hover 不可靠）
// - 桌面端：保持原有 hover 显示行为（鼠标进入显示，离开隐藏）
const playButtonVisible = computed(() => {
  if (isMobile.value) {
    return !isPlaying.value;
  }
  return isHovering.value;
});

// 组件卸载时清理定时器和事件监听
onUnmounted(() => {
  // ✅ 先标记为已卸载（防止异步回调执行）
  isUnmounted = true;

  // ✅ 取消正在进行的实况视频提取请求
  if (extractAbortController) {
    extractAbortController.abort();
    extractAbortController = null;
  }
  stopLiveMediaLoading();

  // ✅ 清理懒加载 observer
  if (lazyObserver && observedElement) {
    lazyObserver.unobserve(observedElement);
    delete observedElement.__livePhotoLoadCallback;
  }

  // 清理所有定时器
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // 释放实况照片 Blob URL
  revokeLiveMedia();
});
</script>

<template>
  <!-- 实况照片 -->
  <div
    v-if="isLive"
    ref="wrapperRef"
    class="live-photo-wrapper relative"
    :class="props.class"
    :style="wrapperStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave">
    <!-- 视频层：提取完成即常驻挂载并预载解码，置于图片层之下（模板在前 + img 的 relative
         压在其上）。非交互时被不透明图片完整盖住，未解码首帧层即使被浏览器合成成
         白色矩形也不可见（规避旧方案 opacity:0 视频层在 GPU 路径下盖白屏的坑）。 -->
    <video
      v-if="videoBlobUrl"
      ref="videoRef"
      :src="videoBlobUrl"
      muted
      playsinline
      preload="auto"
      class="live-photo-video absolute w-full h-full inset-0 max-h-[inherit] rounded-lg pointer-events-none object-cover"
      :style="mediaStyle"
      @ended="onVideoEnded"
      @error="onVideoError" />

    <!-- 原始图片：悬浮/点击播放时淡出（opacity 100->0）把下层已就绪的视频"露"出来 -->
    <img
      ref="imgRef"
      :src="cleanSrc"
      :alt="alt"
      v-bind="liveImageAttrs"
      :loading="lazy ? 'lazy' : 'eager'"
      decoding="async"
      class="live-photo-image relative w-full h-full max-h-[inherit] transition-opacity duration-300 ease-in-out object-cover"
      :style="{
        opacity: imgOpacity / 100,
        ...mediaStyle,
      }"
      @load="onLiveImageLoaded" >

    <div
      v-if="showLiveLoadingTip"
      class="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs text-white backdrop-blur-sm pointer-events-none font-serif">
      <Icon name="ri:loader-4-line" class="size-3.5 animate-spin" mode="svg" />
      <span>加载中</span>
    </div>

    <!-- 实况照片标识 -->
    <div
      v-if="videoBlobUrl && !isPlaying"
      class="live-photo-tip absolute top-3 left-3 text-white text-sm flex items-center gap-1 z-10 pointer-events-none font-serif">
      <Icon name="i-lucide:aperture" class="size-3.5" mode="svg" />
      <span>实况</span>
    </div>

    <!-- 点击播放模式：播放按钮 -->
    <button
      v-if="videoBlobUrl && !effectiveHoverPlay"
      class="absolute bottom-3 right-3 transition-opacity duration-200 z-20 bg-black/20 dark:bg-black/40 rounded-full backdrop-blur-sm border-none cursor-pointer size-8 flex items-center justify-center"
      :class="playButtonVisible ? 'opacity-100' : 'opacity-0'"
      type="button"
      :aria-label="isPlaying ? '暂停实况照片' : '播放实况照片'"
      :aria-pressed="isPlaying"
      @click.stop.prevent="handlePlayClick">
      <Icon v-if="!isPlaying" name="ri:play-fill" class="size-6 text-white drop-shadow-lg" />
      <Icon v-else name="ri:pause-fill" class="size-6 text-white drop-shadow-lg" />
    </button>
  </div>

  <!-- 非实况照片，支持懒加载 -->
  <div
    v-else
    ref="wrapperRef"
    :class="['live-photo-lazy-wrapper', props.class]"
    :style="{
      // 有元数据时始终使用真实比例；没有元数据时才在加载完成前用占位比例
      aspectRatio: mediaAspectRatio ?? (loaded ? 'unset' : (showPlaceholder ? '3/4' : undefined)),
    }">
    <img
      v-if="shouldLoad"
      ref="imgRef"
      :src="actualSrc"
      :alt="alt"
      v-bind="imageAttrs"
      :loading="lazy ? 'lazy' : 'eager'"
      decoding="async"
      class="block w-full h-full object-cover transition-opacity duration-300 opacity-0"      @load="onImageLoaded" @error="onImageError" >
    <!-- 占位骨架屏（图片未解码完成前持续显示，避免空白占位） -->
    <div
      v-if="showPlaceholder && !loaded"
      class="absolute inset-0 bg-slate-100 dark:bg-slate-800 animate-pulse"/>
  </div>
</template>

<style scoped>
.live-photo-wrapper {
  position: relative;
  overflow: hidden;
}

.live-photo-lazy-wrapper {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  min-height: 100px;
}
</style>
