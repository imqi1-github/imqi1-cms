<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
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

// 封面图片
const coverImage = computed(() => {
  if (page.value?.covers && page.value.covers.length > 0) {
    return page.value.covers[0].url;
  }
  return null;
});

const manyCovers = computed(() => page.value?.many_covers && page.value?.covers && page.value.covers.length > 1);

// 页面元数据
useHead({
  title: computed(() => `${page.value?.title || "页面"} - ${siteName.value}`),
  meta: [
    {
      name: "description",
      content: computed(() => page.value?.desc || ""),
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
  <div class="max-w-225 mx-auto px-5 py-8">
    <!-- 加载状态 -->
    <div v-if="pending" class="flex items-center justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p class="ml-3 text-muted-foreground">加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="py-20 text-center">
      <Icon name="lucide:alert-circle" class="size-12 text-destructive mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">页面不存在</h2>
      <p class="text-muted-foreground mb-4">抱歉，您访问的页面不存在或已被删除。</p>
      <NuxtLink to="/">
        <Button>
          <Icon name="lucide:home" class="mr-2 size-4" />
          返回首页
        </Button>
      </NuxtLink>
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
</style>
