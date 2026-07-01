<script setup lang="ts">
// ✅ Catch-all 路由：处理前台 404
// 这是一个普通页面，Header/Footer 不会重新渲染

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

await useNotFoundPage();
</script>

<template>
  <NotFound />
</template>
