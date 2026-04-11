<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { Fancybox } from "@fancyapps/ui";
import { zh_CN } from "@/assets/js/zh_CN.umd.js";
import "@/assets/css/fancybox.css";

const route = useRoute();
const slug = route.params.slug as string;

// 获取站点设置
const { data: siteData } = await useFetch("/api/site");
const siteName = computed(() => siteData.value?.data?.siteName || "ImQi1");
const commentEnabled = computed(() => siteData.value?.data?.commentEnabled ?? true);

// 获取页面数据
const { data, pending, error } = await useFetch(`/api/p/${slug}`);

const page = computed(() => data.value?.data);

// 判断页面是否存在
const isNotFound = computed(() => !pending.value && (!page.value || error.value));

// 页面标题
const pageTitle = ref(`页面未找到 - ${siteName.value}`);

// 在数据加载完成后更新标题
watch(
  [page, isNotFound],
  ([newPage, notFound]) => {
    if (notFound) {
      pageTitle.value = `页面未找到 - ${siteName.value}`;
    } else if (newPage?.title) {
      pageTitle.value = `${newPage.title} - ${siteName.value}`;
    }
  },
  { immediate: true },
);

useHead({
  title: pageTitle,
});

// 封面图片
const coverImage = computed(() => {
  if (page.value?.covers && page.value.covers.length > 0) {
    return page.value.covers[0].url;
  }
  return null;
});

const manyCovers = computed(() => page.value?.many_covers && page.value?.covers && page.value.covers.length > 1);

// 监听 404 状态，触发错误页动画
watch(isNotFound, () => {
  // 只在客户端执行
  if (!import.meta.client) return;

  if (isNotFound.value) {
    nextTick(() => {
      const notFound = document.querySelector(".not-found-fade-in");
      if (notFound) {
        notFound.classList.add("fade-in-start");
      }
    });
  }
});

// 初始化 Fancybox
onMounted(() => {
  // 404 页面动画（初始状态）
  if (isNotFound.value) {
    nextTick(() => {
      const notFound = document.querySelector(".not-found-fade-in");
      if (notFound) {
        notFound.classList.add("fade-in-start");
      }
    });
  }

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
  <div class="max-w-225 mx-auto px-5 py-8">
    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 404 状态 -->
    <div
      v-else-if="isNotFound"
      class="text-center flex items-center justify-center flex-col place-self-center justify-self-center size-full not-found-fade-in">
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

    <!-- 页面内容 -->
    <div v-else-if="page">
      <!-- 标题区域 -->
      <header class="mb-5 animate-fade-in">
        <!-- 封面图片 -->
        <img
          v-if="coverImage"
          data-fancybox="gallery"
          data-caption="封面"
          :src="coverImage"
          alt="封面"
          loading="lazy"
          class="w-full aspect-video max-h-37.5 object-cover border border-gray-200 dark:border-gray-700 mb-2.5 cursor-zoom-in bg-gray-100 dark:bg-gray-800"
          onerror="this.src='/imgs/nopic.png'" />

        <h1 class="text-[3em] font-extrabold mb-2.5">{{ page.title }}</h1>

        <!-- 描述 -->
        <div v-if="page.desc" class="text-[0.8em] text-slate-600 dark:text-slate-400 mb-4">
          {{ page.desc }}
        </div>
      </header>

      <!-- 页面正文 -->
      <article class="animate-fade-in">
        <div
          class="prose prose-slate dark:prose-invert max-w-none
                 prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                 prose-p:text-base prose-p:leading-relaxed
                 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                 prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                 prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950
                 prose-blockquote:border-l-4 prose-blockquote:border-blue-600
                 prose-blockquote:bg-slate-50 dark:prose-blockquote:bg-slate-800/50
                 prose-img:rounded-lg prose-img:shadow-md
                 prose-table:border prose-table:border-slate-200 dark:prose-table:border-slate-700
                 prose-th:bg-slate-100 dark:prose-th:bg-slate-800"
          v-html="page.renderedContent" />
      </article>

      <!-- 评论区 -->
      <section v-if="commentEnabled" class="mt-12 animate-fade-in">
        <CommentList :post-id="page.cid" />
      </section>
    </div>
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

/* 404 页面淡入动画 */
.not-found-fade-in {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.not-found-fade-in.fade-in-start {
  opacity: 1;
  transform: translateY(0);
}
</style>
