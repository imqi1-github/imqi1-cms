<script setup lang="ts">
// ✅ Catch-all 路由：处理前台 404
// 这是一个普通页面，Header/Footer 不会重新渲染

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

useHead({
  title: "页面未找到 - 404",
});
</script>

<template>
  <div class="text-center place-self-center justify-self-center size-full">
    <h1 class="text-[3em] font-bold mb-6 flex items-center justify-center gap-3 text-gray-900 dark:text-gray-100">
      <Icon name="ri:close-large-fill" class="text-red-500" />
      <span>页面未找到</span>
    </h1>

    <p class="text-lg text-slate-600 dark:text-slate-400 mb-8">
      未找到内容，你可以
      <NuxtLink to="/" class="text-blue-600 hover:underline font-medium"> 返回首页 </NuxtLink>
      。
    </p>
  </div>
</template>
