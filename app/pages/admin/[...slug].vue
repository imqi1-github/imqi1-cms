<script setup lang="ts">
// ✅ Catch-all 路由：处理后台 404
definePageMeta({
  layout: false,
});

useHead({
  title: "页面未找到 - 404",
});

// 与前台 404 对齐：服务端返回真正的 404 状态码（后台 catch-all 之前漏了），
// 避免未登录守卫/爬虫把 /admin 不存在的路径误判为 200。
if (import.meta.server) {
  const event = useRequestEvent();
  if (event) setResponseStatus(event, 404);
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="text-center max-w-md">
      <div class="mb-8">
        <Icon name="ri:file-search-line" class="text-6xl text-slate-300 dark:text-slate-600" />
      </div>

      <h1 class="text-2xl font-semibold mb-3 text-slate-800 dark:text-slate-200">页面未找到</h1>

      <p class="text-slate-500 dark:text-slate-400 mb-8">
        您访问的页面不存在或已被删除
      </p>

      <NuxtLink
        to="/admin"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg transition-colors font-medium"
      >
        <Icon name="lucide:arrow-left" class="size-4" />
        返回后台首页
      </NuxtLink>
    </div>
  </div>
</template>
