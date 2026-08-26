<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Swiper from "swiper";
import { Mousewheel, Navigation, Pagination } from "swiper/modules";

// 轮播图：服务端渲染为 .markdown-swiper-wrapper 占位，客户端组件化挂载并自管 Swiper 生命周期。
// 内部图片经 .markdown-live-photo-mount 由外层 gallery 挂载器 hydrate 成 LivePhoto。
defineProps<{
  slides: Array<{ url: string; title: string; width: number | null; height: number | null }>;
  wrapClass: string;
}>();

const rootEl = ref<HTMLElement | null>(null);
let swiper: Swiper | null = null;
let disposed = false;

onMounted(() => {
  // 主体懒加载：仅当存在轮播图才真正初始化（避免无轮播图文章在 onMounted 期间 import swiper 抢主线程）。
  setTimeout(() => {
    if (disposed || !rootEl.value) return;
    swiper = new Swiper(rootEl.value, {
      modules: [Navigation, Pagination, Mousewheel],
      slidesPerView: "auto",
      spaceBetween: 20,
      loop: false,
      mousewheel: { forceToAxis: true, sensitivity: 1, releaseOnEdges: false },
      // 用 rootEl 作用域内的元素，避免多个轮播图时全局 class 选择器把按钮/分页绑到第一个实例
      navigation: {
        nextEl: rootEl.value.querySelector(".swiper-button-next"),
        prevEl: rootEl.value.querySelector(".swiper-button-prev"),
      },
      pagination: {
        el: rootEl.value.querySelector(".swiper-pagination"),
        clickable: true,
      },
      freeMode: false,
      touchRatio: 1,
      resistance: true,
      resistanceRatio: 0.85,
    });
  }, 100);
});

onBeforeUnmount(() => {
  disposed = true;
  swiper?.destroy(true, true);
  swiper = null;
});
</script>

<template>
  <div ref="rootEl" :class="['swiper-container', wrapClass]">
    <div class="swiper-wrapper noneed">
      <div v-for="(slide, i) in slides" :key="i" class="swiper-slide">
        <div
          class="markdown-live-photo-mount"
          :data-src="slide.url"
          :data-caption="slide.title || '图片'"
          data-class="swiper-img"
          :data-aspect-ratio="slide.width && slide.height ? `${slide.width} / ${slide.height}` : undefined"
        />
        <div v-if="slide.title" class="swiper-slide-title">{{ slide.title }}</div>
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
</template>
