<script setup lang="ts">
import { onMounted } from "vue";

// ✅ Catch-all 路由：处理前台 404
// 这是一个普通页面，Header/Footer 不会重新渲染

definePageMeta({
  layout: false, // 不使用 layout，直接在 app.vue 中渲染
});

useHead({
  title: "页面未找到 - 404",
});

// 初始化滚动渐入动画
onMounted(() => {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach((el) => {
    fadeInObserver.observe(el);
  });
});
</script>

<template>
  <div class="text-center place-self-center justify-self-center size-full animate-fade-in">
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
</style>
