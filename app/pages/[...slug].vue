<script setup lang="ts">
import { onMounted } from "vue";

import { siteConfig } from "~~/site.config";

// ✅ Catch-all 路由：处理前台 404

// 这是一个普通页面，Header/Footer 不会重新渲染

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

if (import.meta.server) {
  const event = useRequestEvent();
  if (event) {
    setResponseStatus(event, 404);
  }
}

const { setPageTitle, clearPageTitle } = usePageTitle();
clearPageTitle();
setPageTitle("页面未找到", "ri:close-large-fill");

usePageSeo({
  title: `页面未找到 - ${siteConfig.siteName}`,
  description: siteConfig.pageSeo.notFound.description,
  keywords: siteConfig.pageSeo.notFound.keywords,
});

// 初始化404页面动画
onMounted(() => {
  nextTick(() => {
    const elements = document.querySelectorAll(".animate-fade-in:not(.fade-in-start)");
    if (elements.length) {
      // 延迟触发动画，等待 app.vue 的页面过渡完成（一次 fadeDuration）
      // 文字与 canvas 一起渐入，避免从其他页面进入时 canvas 突然出现而闪烁
      setTimeout(() => {
        requestAnimationFrame(() => {
          elements.forEach((el) => el.classList.add("fade-in-start"));
        });
      }, siteConfig.pageTransition.fadeDuration);
    }
  });
});
</script>

<template>
  <div class="relative w-full overflow-hidden place-self-center justify-self-center h-96">
    <!-- Inspira UI - Singularity Background（黑洞背景，WebGL 着色器） -->
    <ClientOnly>
      <SingularityBackground class="animate-fade-in no-transform absolute inset-0 z-0" mouse-mode="hover" :speed="0.8" :mouse-sensitivity="0.3" />
      <template #fallback>
        <div class="absolute inset-0 z-0 bg-slate-900" />
      </template>
    </ClientOnly>

    <!-- 前景内容 -->
    <div class="relative z-10 text-center place-self-center justify-self-center size-full flex flex-col items-center justify-center animate-fade-in px-6">
      <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3">
        <Icon name="ri:close-large-fill" class="text-red-500 mt-1" />
        <span>页面未找到</span>
      </h1>

      <p class="text-lg text-slate-600 dark:text-slate-200 mb-8">
        未找到内容，你可以
        <NuxtLink to="/" class="text-blue-400 hover:underline font-medium"> 返回首页 </NuxtLink>
        。
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}

/* canvas 背景：只走 opacity 过渡，避免 translateY 让黑洞背景偏移 */
.animate-fade-in.no-transform {
  transform: none;
}
</style>
