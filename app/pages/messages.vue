<script setup lang="ts">
import "@/assets/css/fancybox.css";
import { computed, nextTick, onMounted, watch } from "vue";

import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import { siteConfig } from "~~/site.config";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const commentEnabled = computed(() => siteSettings.value?.commentEnabled ?? true);

// 获取留言板配置
const { data: messageConfig } = await useFetch("/api/messages/config", {
  headers: {
    "x-ssr-internal-request": "true",
  },
});
const messagePostId = computed(() => messageConfig.value?.data?.postId);
const route = useRoute();

function scrollToComment(hash: string) {
  if (!import.meta.client) return;

  const commentId = hash.replace(/^#comment-/, "");
  if (!commentId) return;

  const element = document.getElementById(`comment-${commentId}`);
  if (!element) return;

  const headerOffset = 100;
  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

  window.scrollTo({ top: offsetPosition, behavior: "smooth" });
  element.classList.add("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
  setTimeout(() => {
    element.classList.remove("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
  }, 3000);
}

watch(
  () => route.hash,
  hash => {
    if (!hash?.startsWith("#comment-")) return;
    nextTick(() => {
      let attempts = 0;
      const checkAndScroll = () => {
        const commentId = hash.replace(/^#comment-/, "");
        const element = document.getElementById(`comment-${commentId}`);
        if (element || attempts >= 10) scrollToComment(hash);
        else {
          attempts++;
          setTimeout(checkAndScroll, 100);
        }
      };
      checkAndScroll();
    });
  },
  { immediate: true },
);

// 页面元数据
usePageSeo({
  title: computed(() => `留言 - ${siteName.value}`),
  description: siteConfig.pageSeo.messages.description,
  keywords: siteConfig.pageSeo.messages.keywords,
});

const fancyboxContainer = useTemplateRef("fancyboxContainer");
let FancyboxModule: any = null;

// 封面加载失败时回退到 nopic
const nopicUrl = publicAsset("/imgs/nopic.png");
function handleCoverError(event: Event) {
  const target = event.target as HTMLImageElement;
  if (target) target.src = nopicUrl;
}

// 初始化 Fancybox
onMounted(async () => {
  // 动态导入 Fancybox（仅客户端）
  FancyboxModule = await import("@fancyapps/ui");
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
  FancyboxModule.Fancybox.bind(fancyboxContainer.value, "[data-fancybox]", {
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
  } as any);
});

onUnmounted(() => {
  // Fancybox.destroy();
  if (FancyboxModule) {
    FancyboxModule.Fancybox.unbind(fancyboxContainer.value);
  }
});
</script>

<template>
  <div class="max-w-225 mx-auto">
    <!-- 标题区域 -->
    <header ref="fancyboxContainer" class="animate-fade-in">
      <!-- 封面图片 -->
      <img
        data-fancybox="gallery"
        data-caption="封面"
        :src="publicAsset('/imgs/message-cover.png')"
        alt="封面"
        loading="lazy"
        class="w-full aspect-video max-h-37.5 object-cover border border-gray-200 dark:border-gray-700 mb-2.5 cursor-zoom-in bg-gray-100 dark:bg-gray-800"
        @error="handleCoverError" >

      <!-- 标题 -->
      <h1 class="text-[3em] font-extrabold mb-2.5">留言</h1>

      <!-- 描述 -->
      <MapEntryLinks :views="['footprint']" title="聚集五湖四海的朋友" />
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
      <CommentList v-else-if="commentEnabled" :post-id="messagePostId" :load-all-comments="!!route.hash && route.hash.startsWith('#comment-')" />
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
