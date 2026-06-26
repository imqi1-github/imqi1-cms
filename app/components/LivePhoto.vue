<script setup lang="ts">
import { onMounted, ref, useAttrs, type CSSProperties } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useLivePhoto } from "~/composables/useLivePhoto";

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
  }>(),
  {
    hoverPlay: true,
    lazy: true,
  },
);

const attrs = useAttrs();

// 过滤出fancybox相关的属性，只传给img
const fancyboxAttrs = computed(() => {
  const result: Record<string, any> = {};
  (Object.keys(attrs) as Array<keyof typeof attrs>).forEach(key => {
    if (key.startsWith("data-") || key === "id" || key === "title" || key === "loading") {
      result[key] = attrs[key];
    }
  });
  // 标记实况照片，供 Fancybox 灯箱识别后在灯箱内提供实况视频播放
  if (props.src.includes("#live")) {
    result["data-live-photo"] = "";
  }
  return result;
});

const { extractMotionVideo, isLivePhoto, cleanLivePhotoUrl } = useLivePhoto();

// 状态
const imgRef = ref<HTMLImageElement | null>(null);
const videoBlobUrl = ref<string | null>(null);
const isPlaying = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
const wrapperRef = ref<HTMLDivElement | null>(null);
const imageNaturalWidth = ref<number | null>(null);
const imageNaturalHeight = ref<number | null>(null);
const imageFitMode = ref<"width" | "height" | "scale">("scale");
const isHovering = ref(false);

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

// ✅ 懒加载状态：是否已经开始加载
const shouldLoad = ref<boolean>(!props.lazy || isLive.value);
// ✅ IntersectionObserver 单例（全局共享，性能更好）
let lazyObserver: IntersectionObserver | null = null;

// 实际加载的 src：懒加载时只有在可见后才设置
const actualSrc = computed(() => {
  if (!shouldLoad.value) return '';
  return isLive.value ? cleanSrc.value : props.src;
});

// 初始化懒加载监听
const initLazyLoading = (el: HTMLElement) => {
  if (!props.lazy || isLive.value) return;

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
          const img = entry.target as HTMLImageElement;
          lazyObserver!.unobserve(img);
          // @ts-ignore - 我们在 dataset 中存储了回调
          img.__livePhotoLoadCallback?.();
        }
      }
    }, {
      rootMargin: '300px 0px', // 提前 300px 开始加载，用户滚动到的时候已经加载好
      threshold: 0.01,
    });
  }

  // 存储加载回调，observer 触发时调用
  // @ts-ignore
  el.__livePhotoLoadCallback = () => {
    shouldLoad.value = true;
  };

  lazyObserver.observe(el);
};

// 计算包裹容器的样式
const wrapperStyle = computed(() => {
  // 如果是轮播图中的图片（有 swiper-img 类），需要特殊处理
  if (props.class?.includes("swiper-img")) {
    // 如果有图片自然尺寸，计算容器宽度
    if (imageNaturalWidth.value && imageNaturalHeight.value) {
      const swiperWrapper = wrapperRef.value?.closest(".swiper-wrapper");
      if (swiperWrapper) {
        const containerHeight = swiperWrapper.clientHeight || 650;
        const imageRatio = imageNaturalWidth.value / imageNaturalHeight.value;
        const calculatedWidth = Math.round(containerHeight * imageRatio);

        return {
          width: `${calculatedWidth}px`,
          height: "100%",
        };
      }
    }
    return {
      width: "auto",
      height: "100%",
    };
  }
  return {};
});

// 计算图片/视频的样式
const mediaStyle = computed<CSSProperties>(() => {
  if (props.class?.includes("swiper-img")) {
    // 根据填充模式返回不同的样式
    if (imageFitMode.value === "width") {
      return {
        width: "100%",
        height: "auto",
        objectFit: "cover",
      };
    } else if (imageFitMode.value === "height") {
      return {
        width: "100%",
        height: "100%",
        objectFit: "cover",
      };
    } else {
      // scale 模式：都小于容器，需要缩放
      return {
        width: "100%",
        height: "100%",
        objectFit: "cover",
      };
    }
  }
  return {};
});

// 标记组件是否已卸载
let isUnmounted = false;
// ✅ 用于取消实况视频提取请求
let extractAbortController: AbortController | null = null;
// 保存 observer 引用用于卸载
let observedElement: HTMLElement | null = null;

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

  if (!isLive.value) {
    return;
  }

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

  // 监听图片加载
  if (imgRef.value) {
    if (imgRef.value.complete) {
      // 图片已经加载完成
      calculateFitMode();
    } else {
      // 等待图片加载完成
      imgRef.value.onload = calculateFitMode;
    }
  }

  // ✅ 创建 AbortController 用于快速切页时取消请求
  extractAbortController = new AbortController();

  // 提取实况视频
  const videoUrl = await extractMotionVideo(cleanSrc.value, extractAbortController.signal);

  // ✅ 异步操作后检查
  if (isUnmounted) {
    return;
  }

  if (videoUrl) {
    videoBlobUrl.value = videoUrl;
  }
});

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
    .catch(err => {
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

  // ✅ 清理懒加载 observer
  if (lazyObserver && observedElement) {
    lazyObserver.unobserve(observedElement);
    // @ts-ignore
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

  // 释放视频 Blob URL
  if (videoBlobUrl.value) {
    URL.revokeObjectURL(videoBlobUrl.value);
    videoBlobUrl.value = null;
  }
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
    <!-- 原始图片 -->
    <img
      ref="imgRef"
      :src="cleanSrc"
      :alt="alt"
      v-bind="fancyboxAttrs"
      loading="lazy"
      class="live-photo-image w-full h-full max-h-[inherit] transition-opacity duration-300 ease-in-out object-cover"
      :style="{
        opacity: imgOpacity / 100,
        ...mediaStyle,
      }" />

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
      <Icon name="ri:play-circle-fill" class="size-4" mode="svg" />
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

    <!-- 图片名字 -->
    <div
      v-if="alt"
      class="live-photo-name absolute bottom-0 left-0 right-0 px-2 py-1 bg-linear-to-t from-black/70 to-transparent text-white text-xs text-center opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none">
      {{ alt }}
    </div>
  </div>

  <!-- 非实况照片，支持懒加载 -->
  <div
    v-else
    ref="wrapperRef"
    :class="['live-photo-lazy-wrapper', props.class]"
    :style="{
      // 默认使用 3/4 占位宽高比，避免高度为0导致布局错乱
      aspectRatio: shouldLoad ? 'unset' : '3/4',
    }">
    <img
      v-if="shouldLoad"
      ref="imgRef"
      :src="actualSrc"
      :alt="alt"
      v-bind="fancyboxAttrs"
      loading="lazy"
      class="block w-full h-full max-h-37.5 object-cover transition-opacity duration-300 opacity-0"
      @load="(e) => { (e.target as HTMLImageElement).classList.add('opacity-100'); }" />
    <!-- 占位骨架屏（未加载时显示） -->
    <div
      v-if="!shouldLoad"
      class="absolute inset-0 bg-slate-100 dark:bg-slate-800 animate-pulse"></div>
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
