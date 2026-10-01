<script setup lang="ts">
// ✅ /404 显式路由：复用 catch-all 的 404 页面

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

await useNotFoundPage();

// 显式 /404 路由 = 用户直接访问时 SSR 必返 404(否则 soft-404,SEO 把 NotFound 当有效内容)
if (import.meta.server) {
  const event = useRequestEvent();
  if (event) setResponseStatus(event, 404);
}
</script>

<template>
  <NotFound />
</template>
