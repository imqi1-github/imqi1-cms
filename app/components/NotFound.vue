<script setup lang="ts">
import { siteConfig } from "~~/site.config";

// 前台 404 统一外观：黑洞背景 + 居中标题 + 返回首页。
// 供 catch-all [...slug].vue、/404 路由，以及 tag/category/content 等内联 404 态复用。
// 标题文案按场景传入（"标签不存在"/"分类不存在"等），默认"页面未找到"。
withDefaults(defineProps<{ title?: string }>(), { title: "页面未找到" });
</script>

<template>
  <div class="relative w-full overflow-hidden place-self-center justify-self-center h-96">
    <!-- Inspira UI - Singularity Background（黑洞背景，WebGL 着色器） -->
    <ClientOnly>
      <SingularityBackground v-scroll-reveal.no-transform="{ delay: siteConfig.pageTransition.fadeDuration }" class="absolute inset-0 z-0" mouse-mode="hover" :speed="0.8" :mouse-sensitivity="0.3" />
      <template #fallback>
        <div class="absolute inset-0 z-0 bg-slate-900" />
      </template>
    </ClientOnly>

    <!-- 前景内容 -->
    <div v-scroll-reveal="{ delay: siteConfig.pageTransition.fadeDuration }" class="relative z-10 text-center place-self-center justify-self-center size-full flex flex-col items-center justify-center px-6">
      <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-500 dark:text-gray-300">
        <Icon name="ri:close-large-fill" class="text-red-500 mt-1" />
        <span>{{ title }}</span>
      </h1>

      <p class="text-lg text-slate-400 dark:text-slate-200 mb-8">
        未找到内容，你可以
        <NuxtLink to="/" class="text-blue-400 hover:underline font-medium"> 返回首页 </NuxtLink>
        。
      </p>
    </div>
  </div>
</template>
