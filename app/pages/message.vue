<script setup lang="ts">
import "@/assets/css/fancybox.css";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import { Fancybox } from "@fancyapps/ui";
import { computed, onMounted } from "vue";

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");
const commentEnabled = computed(() => siteData.value?.data?.commentEnabled ?? true);

// 获取留言板配置
const { data: messageConfig } = await useFetch("/api/message/config");
const messagePostId = computed(() => messageConfig.value?.data?.postId);

// 页面元数据
useHead({
  title: computed(() => `留言 - ${siteName.value}`),
  meta: [
    {
      name: "description",
      content: "在 ImQi1 留言板留下你的足迹，说出你的想法。欢迎与我交流技术和生活。",
    },
    {
      name: "keywords",
      content: "留言,留言板,评论,交流,互动",
    },
    {
      property: "og:title",
      content: computed(() => `留言 - ${siteName.value}`),
    },
    {
      property: "og:description",
      content: "在 ImQi1 留言板留下你的足迹，说出你的想法。欢迎与我交流技术和生活。",
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      name: "twitter:title",
      content: computed(() => `留言 - ${siteName.value}`),
    },
    {
      name: "twitter:description",
      content: "在 ImQi1 留言板留下你的足迹，说出你的想法。欢迎与我交流技术和生活。",
    },
  ],
});

// 初始化 Fancybox
onMounted(() => {
  // 初始化滚动渐入动画
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const fadeInObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("fade-in-start");
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 观察所有需要滚动渐入的元素
  document.querySelectorAll(".animate-fade-in:not(.fade-in-start)").forEach(el => {
    fadeInObserver.observe(el);
  });

  // 初始化 Fancybox
  Fancybox.bind("[data-fancybox]", {
    l10n: zh_CN,
    placeFocusBack: false,
    Hash: false,
    trapFocus: false,
    closeExisting: false,
    zoomEffect: true,
    Carousel: {
      Panzoom: {
        maxScale: 2,
      },
      Toolbar: {
        display: {
          left: ["infobar"],
          middle: ["zoomIn", "zoomOut", "toggle1to1", "rotateCCW", "rotateCW", "flipX", "flipY"],
          right: ["thumbs", "close"],
        },
      },
      Autoplay: false,
    },
    idle: false,
    autoFocus: false,
    tpl: {
      main: `<div class="fancybox__container" role="dialog" tabindex="-1">
  <div class="fancybox__backdrop"></div>
  <div class="fancybox__carousel"></div>
  <div class="fancybox__footer"></div>
</div>`,
    },
  });
});

onUnmounted(() => {
  Fancybox.destroy();
});
</script>

<template>
  <div class="max-w-225 mx-auto">
    <!-- 标题区域 -->
    <header class="mb-5 animate-fade-in">
      <!-- 封面图片 -->
      <img
        data-fancybox="gallery"
        data-caption="封面"
        src="/imgs/message-cover.png"
        alt="封面"
        loading="lazy"
        class="w-full aspect-video max-h-37.5 object-cover border border-gray-200 dark:border-gray-700 mb-2.5 cursor-zoom-in bg-gray-100 dark:bg-gray-800"
        onerror="this.src = '/imgs/nopic.png'" />

      <!-- 标题 -->
      <h1 class="text-[3em] font-extrabold mb-2.5">留言</h1>

      <!-- 描述 -->
      <div class="text-[0.8em] text-slate-600 dark:text-slate-400 mb-4">留下你的足迹，说出你的想法。</div>
    </header>

    <!-- 留言内容区域 -->
    <section class="my-8 animate-fade-in">
      <!-- 未配置提示 -->
      <div v-if="!messagePostId" class="py-10 text-center">
        <Icon name="lucide:alert-circle" class="size-8 text-amber-500 mx-auto mb-2" />
        <p class="text-amber-600 dark:text-amber-400 mb-4">留言板尚未初始化</p>
        <p class="text-sm text-slate-500">请联系管理员在后台设置留言板关联文章</p>
      </div>

      <!-- 评论区 -->
      <CommentList v-else-if="commentEnabled" :post-id="messagePostId" />
    </section>
  </div>
</template>

<style scoped>
/* 滚动淡入动画 */
.animate-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.animate-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}
</style>
