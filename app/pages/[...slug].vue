<script setup lang="ts">
// ✅ Catch-all 路由：处理前台 404(普通页,Header/Footer 不重渲染)

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

await useNotFoundPage();

// 兜底 = 未匹配任何已知路由,SSR 必返 404(否则 soft-404,SEO 把 NotFound 当有效内容索引)
if (import.meta.server) {
  const event = useRequestEvent();
  if (event) setResponseStatus(event, 404);
}
</script>

<template>
  <NotFound />
</template>
