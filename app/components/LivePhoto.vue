<script setup lang="ts">
import {type CSSProperties, onMounted, ref, useAttrs} from "vue";
import {useMediaQuery} from "@vueuse/core";

import {useLivePhoto} from "~/composables/useLivePhoto";
import type {LivePhotoElement} from "~/types/components/live-photo";

// 禁用自动属性继承，手动控制属性传递
defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    class?: string;
    hoverPlay?: boolean; // 是否悬浮播放，默认 true
    lazy?: boolean; // 是否开启可见性懒加载，默认 true（仅对非实况照片生效）
    width?: number | string | null;
    height?: number | string | null;
    aspectRatio?: string | null;
    showPlaceholder?: boolean; // 图片加载完成前是否显示占位骨架
  }>(),
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

// 过滤出fancybox相关的属性，只传给img
const fancyboxAttrs = computed(() => {
  const result: Record<string, string> = {};
  (Object.keys(attrs) as Array<keyof typeof attrs>).forEach(key => {
    if (key.startsWith("data-") || key === "id" || key === "title" || key === "loading") {
      result[key] = attrs[key] as string;
    }
  });
  // 标记实况照片，供 Fancybox 灯箱识别后在灯箱内提供实况视频播放
  if (props.src.includes("#live")) {
    result["data-live-photo"] = "";
  }
  return result;
});

const imageAttrs = computed(() => ({
  ...fancyboxAttrs.value,
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

// 移动端判定：移动端无 hover 事件，需要强制切换为点击播放模式并让按钮常驻
const isMobile = useMediaQuery("(max-width: 768px)");
// 实际生效的悬浮播放模式：移动端无论 props.hoverPlay 为何，都不走 hover 自动播放
const effectiveHoverPlay = computed(() => props.hoverPlay && !isMobile.value);

// 两个独立的透明度状态，用于交叉淡入淡出
const imgOpacity = ref(100);
const videoOpacity = ref(0);

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
// ✅ IntersectionObserver 单例（全局共享，性能更好）
let lazyObserver: IntersectionObserver | null = null;

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
// let imgOpacityTimer: number | null = null;
let videoOpacityTimer: number | null = null;
let resetTimer: number | null = null;

// 鼠标悬浮 - 播放视频（仅悬浮播放模式）
const handleMouseEnter = async () => {
  isHovering.value = true; // 标记悬浮状态

  if (!effectiveHoverPlay.value) return; // 点击播放模式不处理悬浮

  // 检查是否有视频 URL
  if (!videoBlobUrl.value) {
    return;
  }

  // 清除所有之前的定时器
  // if (imgOpacityTimer !== null) {
  //   clearTimeout(imgOpacityTimer);
  //   imgOpacityTimer = null;
  // }
  if (videoOpacityTimer !== null) {
    clearTimeout(videoOpacityTimer);
    videoOpacityTimer = null;
  }
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // 等待 DOM 更新，确保 video 元素已渲染
  await nextTick();

  // ✅ 异步操作后检查：组件已卸载或 DOM 不存在则返回
  if (isUnmounted || !videoRef.value) {
    return;
  }

  // 先设置视频到开头
  videoRef.value.currentTime = 0;

  // 交叉淡入淡出：
  // 1. 先让视频淡入（0 -> 100）
  videoOpacity.value = 100;

  // 2. 等待一小段时间后，再让图片淡出
  // imgOpacityTimer = window.setTimeout(() => {
  //   imgOpacity.value = 0;
  // }, 150); // 150ms 后让图片淡出

  // 3. 开始播放视频
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
        // imgOpacity.value = 100;
        videoOpacity.value = 0;
        isPlaying.value = false;
      }
    });
};

// 鼠标移开 - 恢复显示图片（仅悬浮播放模式）
const handleMouseLeave = () => {
  isHovering.value = false; // 标记悬浮结束

  if (!effectiveHoverPlay.value) return; // 点击播放模式不处理悬浮

  if (!videoRef.value) return;

  // 清除所有之前的定时器
  // if (imgOpacityTimer !== null) {
  //   clearTimeout(imgOpacityTimer);
  //   imgOpacityTimer = null;
  // }
  if (videoOpacityTimer !== null) {
    clearTimeout(videoOpacityTimer);
    videoOpacityTimer = null;
  }
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  // 交叉淡入淡出：
  // 1. 先让图片淡入（0 -> 100）
  // imgOpacity.value = 100;

  // 2. 等待一小段时间后，再让视频淡出
  // videoOpacityTimer = window.setTimeout(() => {
    videoOpacity.value = 0;
  // }, 150); // 50ms 后让视频淡出

  // 3. 暂停视频并重置进度
  videoRef.value.pause();
  isPlaying.value = false;

  resetTimer = window.setTimeout(() => {
    if (videoRef.value) {
      videoRef.value.currentTime = 0;
    }
  }, 150); // 等待过渡完成后重置
};

// 点击播放/暂停（点击播放模式）
const handlePlayClick = async () => {
  if (effectiveHoverPlay.value) return; // 悬浮播放模式不处理点击

  if (!videoBlobUrl.value) return;

  // 清除所有之前的定时器
  // if (imgOpacityTimer !== null) {
  //   clearTimeout(imgOpacityTimer);
  //   imgOpacityTimer = null;
  // }
  if (videoOpacityTimer !== null) {
    clearTimeout(videoOpacityTimer);
    videoOpacityTimer = null;
  }
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }

  await nextTick();

  if (videoRef.value) {
    if (isPlaying.value) {
      // 暂停
      // imgOpacity.value = 100;
      videoOpacityTimer = window.setTimeout(() => {
        videoOpacity.value = 0;
      }, 50);
      videoRef.value.pause();
      isPlaying.value = false;
    } else {
      // 播放
      videoRef.value.currentTime = 0;
      videoOpacity.value = 100;
      // imgOpacityTimer = window.setTimeout(() => {
      //   imgOpacity.value = 0;
      // }, 50);
      videoRef.value
        .play()
        .then(() => {
          isPlaying.value = true;
        })
        .catch(err => {
          console.error("[LivePhoto] 视频播放失败:", err);
          // imgOpacity.value = 100;
          videoOpacity.value = 0;
          isPlaying.value = false;
        });
    }
  }
};

// 视频播放结束
const onVideoEnded = () => {
  // 视频播放结束后自动暂停并显示图片
  if (videoRef.value && isPlaying.value) {
    // 显示图片
    // imgOpacity.value = 100;

    // 等待一小段时间后隐藏视频
    // setTimeout(() => {
    if (videoRef.value) {
      videoOpacity.value = 0;
    }
    // }, 25);

    // 更新播放状态
    isPlaying.value = false;
  }
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
  // if (imgOpacityTimer !== null) {
  //   clearTimeout(imgOpacityTimer);
  //   imgOpacityTimer = null;
  // }
  if (videoOpacityTimer !== null) {
    clearTimeout(videoOpacityTimer);
    videoOpacityTimer = null;
  }
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
    <!-- 原始图片：Blob URL 准备好后再挂载，避免空 src 短暂显示碎图图标 -->
    <img
      v-if="imageBlobUrl"
      ref="imgRef"
      :src="imageBlobUrl"
      :alt="alt"
      v-bind="liveImageAttrs"
      loading="lazy"
      decoding="async"
      class="live-photo-image w-full h-full max-h-[inherit] transition-opacity duration-300 ease-in-out object-cover"
      :style="{
        opacity: imgOpacity / 100,
        ...mediaStyle,
      }"
      @load="onLiveImageLoaded" >
    <div
      v-else-if="showPlaceholder"
      class="absolute inset-0 bg-slate-100 dark:bg-slate-800 animate-pulse"/>

    <div
      v-if="showLiveLoadingTip"
      class="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs text-white backdrop-blur-sm pointer-events-none">
      <Icon name="ri:loader-4-line" class="size-3.5 animate-spin" mode="svg" />
      <span>加载中</span>
    </div>

    <!-- 视频容器 -->
    <video
      v-if="videoBlobUrl"
      ref="videoRef"
      :src="videoBlobUrl"
      muted
      playsinline
      preload="auto"
      class="live-photo-video absolute w-full h-full inset-0 max-h-[inherit] rounded-lg pointer-events-none transition-opacity duration-300 ease-in-out object-cover"
      :style="{
        opacity: videoOpacity / 100,
        ...mediaStyle,
      }"
      @ended="onVideoEnded" />

    <!-- 实况照片标识 -->
    <div
      v-if="videoBlobUrl && !isPlaying"
      class="live-photo-tip absolute top-3 left-3 text-white text-sm flex items-center gap-1 z-10 pointer-events-none">
      <Icon name="i-lucide:aperture" class="size-3.5" mode="svg" />
      <span>实况</span>
    </div>

    <!-- 点击播放模式：播放按钮 -->
    <button
      v-if="videoBlobUrl && !effectiveHoverPlay"
      class="absolute bottom-3 right-3 transition-opacity duration-200 z-20 bg-black/20 dark:bg-black/40 rounded-full backdrop-blur-sm border-none cursor-pointer size-8 flex items-center justify-center"
      :class="playButtonVisible ? 'opacity-100' : 'opacity-0'"
      type="button"
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
      loading="lazy"
      decoding="async"
      class="block w-full h-full object-cover transition-opacity duration-300 opacity-0"      @load="onImageLoaded" >
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
