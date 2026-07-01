<script setup lang="ts">
import {onMounted, onUnmounted, ref, useTemplateRef, watch} from "vue";
import {Mousewheel, Navigation, Pagination} from "swiper/modules";

import {zh_CN} from "@/assets/js/zh_CN.umd.js";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "@/assets/css/fancybox.css";
import type {Props} from "~/types/components/cover-swiper";

// swiper 主体（Swiper 类，~156kB）懒加载，避免静态打包进共享 chunk、拖累首屏。
// 3 个模块用静态具名 import：能 tree-shake 只留用到的 3 个（合计 ~45kB），
// 不会像 `await import("swiper/modules")` 那样把 16 个模块整体打包（215kB）。
// 注意：swiper 的 package.json exports 未暴露 modules/*.mjs 子路径，无法直接
// 动态 import 具体模块文件，故模块走静态 import，仅主体动态加载。
type SwiperType = typeof import("swiper").default;
let swiperPromise: Promise<SwiperType> | null = null;
const loadSwiper = () => {
  if (!swiperPromise) {
    swiperPromise = import("swiper").then(m => m.default);
  }
  return swiperPromise;
};

const props = withDefaults(defineProps<Props>(), {
  isPhotoCategory: false,
});

const swiperContainer = ref<HTMLElement>();
const fancyboxContainer = useTemplateRef<HTMLDivElement>("fancyboxContainer");
let swiperInstance: import("swiper").default | null = null;
let FancyboxModule: typeof import("@fancyapps/ui") | null = null;
// ✅ 标记组件是否已卸载
let isUnmounted = false;
// 延迟初始化的 setTimeout 句柄 —— 卸载时取消，避免待执行回调在销毁后触发 initSwiper
let initTimer: ReturnType<typeof setTimeout> | null = null;

// 灯箱实况照片增强：在 Fancybox 灯箱中为实况照片注入视频播放能力
const { enhanceConfig: enhanceFancyboxLivePhoto } = useFancyboxLivePhoto();

const initSwiper = async () => {
  if (!swiperContainer.value || props.covers.length === 0) return;

  const Swiper = await loadSwiper();

  // ✅ 异步操作后检查 DOM 是否还存在
  if (isUnmounted || !swiperContainer.value) {
    return;
  }

  // 销毁旧实例
  if (swiperInstance && !swiperInstance.destroyed) {
    swiperInstance.destroy(true, true);
  }

  swiperInstance = new Swiper(swiperContainer.value, {
    modules: [Navigation, Pagination, Mousewheel],
    slidesPerView: "auto",
    spaceBetween: 20,
    loop: false,
    mousewheel: {
      forceToAxis: true,
      sensitivity: 1,
      releaseOnEdges: false,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    // 确保滑动对齐
    freeMode: false,
    touchRatio: 1,
    resistance: true,
    resistanceRatio: 0.85,
  });
};

onMounted(async () => {
  // 延迟初始化，确保 DOM 已渲染
  initTimer = setTimeout(() => {
    initSwiper();
  }, 100);

  // 初始化 Fancybox
  FancyboxModule = await import("@fancyapps/ui");

  // ✅ 异步操作后检查组件是否已卸载
  if (isUnmounted || !fancyboxContainer.value) {
    return;
  }

  FancyboxModule.Fancybox.bind(fancyboxContainer.value, "[data-fancybox]", enhanceFancyboxLivePhoto({
      l10n: zh_CN,
      Hash: false,
      Carousel: {
        Zoomable: {
          Panzoom: {
            maxScale: 2,
          },
        },
        Toolbar: {
          display: {
            left: ["infobar"],
            middle: ["zoomIn", "zoomOut", "toggleZoom", "rotateCCW", "rotateCW", "flipX", "flipY"],
            right: ["thumbs", "close"],
          },
        },
        Autoplay: {
          autoStart: false,
        },
      },
    }));
});

// 合并清理逻辑
onUnmounted(() => {
  // ✅ 先标记为已卸载
  isUnmounted = true;

  // 取消待执行的延迟初始化回调
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }

  // 销毁 Swiper
  if (swiperInstance && !swiperInstance.destroyed) {
    swiperInstance.destroy(true, true);
  }

  // 清理 Fancybox
  if (FancyboxModule && fancyboxContainer.value) {
    FancyboxModule.Fancybox.unbind(fancyboxContainer.value);
  }
});

// 监听 covers 变化，重新初始化
watch(
  () => props.covers,
  () => {
    initTimer = setTimeout(() => {
      initSwiper();
    }, 100);
  },
  { deep: true },
);
</script>

<template>
  <div ref="fancyboxContainer">
    <div ref="swiperContainer" class="swiper-container">
    <div :class="['swiper-wrapper', !isPhotoCategory && 'noneed']">
      <div v-for="(cover, index) in covers" :key="index" class="swiper-slide">
        <LivePhoto
          :src="cover.url"
          :alt="cover.desc || '封面'"
          :hover-play="false"
          class="swiper-img"
          data-fancybox="gallery"
          :data-caption="cover.desc || '封面'"
          loading="lazy"
        />
        <div v-if="cover.desc" class="swiper-slide-title">
          {{ cover.desc }}
        </div>
      </div>
    </div>
    <div class="flex justify-between items-center h-8">
      <div class="swiper-pagination"/>
      <div class="swiper-buttons absolute right-0 mt-1.5">
        <div class="swiper-button-prev"/>
        <div class="swiper-button-next"/>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* Swiper 容器 */
.swiper-container {
  margin: 0 0 20px;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.swiper-container:not(.swiper-initialized) > .swiper-wrapper {
  gap: 20px
}

/* Swiper 包装器 - 关键：使用 slidesPerView: 'auto' 实现横向填充 */
.swiper-wrapper {
  display: flex;
  height: 650px;
  transition-timing-function: ease;
  width: 100%;
  z-index: 1;
  /* 确保wrapper不会换行 */
  flex-wrap: nowrap;
  border-radius: 15px;
}

/* .swiper-wrapper > .swiper-slide:not(:last-child) {
  margin-right: 20px;
} */

.swiper-wrapper.noneed {
  height: 350px;
}

/* Swiper 幻灯片 - 关键样式实现图片停靠左侧并填充容器 */
.swiper-slide {
  /* 自动宽度，由图片内容决定 */
  width: auto;
  /* 不允许收缩 */
  flex-shrink: 0;
  height: 100%;
  position: relative;
  border: 1px solid rgb(229 231 235);
  border-radius: 15px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.dark .swiper-slide {
  border-color: rgb(51 65 85);
}

/* 图片 - 保持原始宽度，填充slide */
.swiper-img {
  display: block;
  height: 100%;
  /* 图片宽度自适应内容 */
  width: auto;
  /* 限制最大宽度不超过容器 */
  max-width: 100%;
  /* 确保图片不会超出视口 */
  object-fit: cover;
  flex-shrink: 0;
  cursor: zoom-in;
}

/* 图片描述 - 显示在图片下方，带文字阴影 */
.swiper-slide-title {
  text-align: center;
  color: white;
  width: 100%;
  font-size: 13px;
  line-height: 1.4;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  padding: 12px 12px 4px 12px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.247), transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
}

/* 美化滚动条 */
.swiper-slide::-webkit-scrollbar {
  width: 4px;
}

.swiper-slide::-webkit-scrollbar-track {
  background: transparent;
}

.swiper-slide::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.swiper-slide::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* 控制按钮区域 */
.swiper-buttons {
  display: flex;
  align-items: center;
  margin-top: 10px;
  gap: 8px;
}

/* 分页器 */
.swiper-pagination {
  display: flex;
  flex-grow: 1;
}

:deep(.swiper-pagination-bullet) {
  background: rgb(148 163 184);
  border-radius: 4px;
  display: inline-block;
  height: 8px;
  transition: 0.15s;
  width: 8px;
  opacity: 1;
}

:deep(.swiper-pagination-bullet-active) {
  background: rgb(37 99 235);
}

:deep(.swiper-pagination-bullet:hover) {
  background: rgb(37 99 235);
  opacity: 1;
}

/* 导航按钮 */
.swiper-button-prev,
.swiper-button-next {
  align-items: center;
  color: rgb(148 163 184);
  cursor: pointer;
  display: flex;
  justify-content: center;
  width: 16px;
  height: 16px;
  transition: 0.15s;
  position: static;
  margin: 0;
}

.swiper-button-prev:hover,
.swiper-button-next:hover {
  color: rgb(37 99 235);
}

:deep(.swiper-button-disabled) {
  cursor: auto;
  opacity: 0.35;
  pointer-events: none;
}

/* 响应式 */
@media (max-width: 768px) {
  .swiper-wrapper {
    height: 350px;
  }

  .swiper-wrapper.noneed {
    height: 250px;
  }
}
</style>
