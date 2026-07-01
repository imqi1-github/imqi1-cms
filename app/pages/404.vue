<script setup lang="ts">
// ✅ /404 显式路由：复用 catch-all 的 404 页面

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

await useNotFoundPage();
</script>

<template>
  <NotFound />
</template>
