<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onUnmounted, watch } from "vue";
import Swiper from "swiper";
import { Navigation, Pagination, Mousewheel } from "swiper/modules";
import { Fancybox } from "@fancyapps/ui";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "@/assets/css/fancybox.css";

interface Cover {
  url: string;
  desc?: string;
}

interface Props {
  covers: Cover[];
  isPhotoCategory?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isPhotoCategory: false,
});

const swiperContainer = ref<HTMLElement>();
let swiperInstance: Swiper | null = null;

const initSwiper = () => {
  if (!swiperContainer.value || props.covers.length === 0) return;

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

onMounted(() => {
  // 延迟初始化，确保 DOM 已渲染
  setTimeout(() => {
    initSwiper();
  }, 100);
});

onBeforeUnmount(() => {
  if (swiperInstance && !swiperInstance.destroyed) {
    swiperInstance.destroy(true, true);
  }
});

// 清理 Fancybox
onUnmounted(() => {
  Fancybox.destroy();
});

// 监听 covers 变化，重新初始化
watch(
  () => props.covers,
  () => {
    setTimeout(() => {
      initSwiper();
    }, 100);
  },
  { deep: true },
);
</script>

<template>
  <div ref="swiperContainer" class="swiper-container">
    <div :class="['swiper-wrapper', !isPhotoCategory && 'noneed']">
      <div v-for="(cover, index) in covers" :key="index" class="swiper-slide">
        <img :src="cover.url" :alt="cover.desc || '封面'" data-fancybox="gallery" :data-caption="cover.desc || '封面'" class="swiper-img" loading="lazy" />
        <div v-if="cover.desc" class="swiper-slide-title">
          {{ cover.desc }}
        </div>
      </div>
    </div>
    <div class="flex justify-between items-center h-8">
      <div class="swiper-pagination"></div>
      <div class="swiper-buttons absolute right-0">
        <div class="swiper-button-prev"></div>
        <div class="swiper-button-next"></div>
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
  /* 最小宽度为内容宽度，确保图片完整显示 */
  min-width: fit-content;
  /* 不允许收缩 */
  flex-shrink: 0;
  height: 100%;
  position: relative;
  border: 1px solid rgb(229 231 235);
  border-radius: 15px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dark .swiper-slide {
  border-color: rgb(51 65 85);
}

/* 图片 - 保持原始宽度，填充slide */
.swiper-img {
  display: block;
  height: 100%;
  /* 图片宽度自适应内容，不设上限 */
  width: auto;
  max-width: none;
  /* 确保图片不会超出视口 */
  object-fit: contain;
  flex-shrink: 0;
  cursor: zoom-in;
}

/* 图片描述 - 显示在图片下方，带文字阴影 */
.swiper-slide-title {
  text-align: center;
  color: white;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.4;
  /* 文字阴影确保可读性 */
  text-shadow:
    0 1px 2px rgba(0, 0, 0, 0.8);
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
  gap: 2px;
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
  width: 16px;
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
