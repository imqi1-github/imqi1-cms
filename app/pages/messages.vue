<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from "vue";

import { siteConfig } from "~~/site.config";

// 使用全局站点设置
const { siteSettings } = useSiteSettings();
const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const commentEnabled = computed(() => siteSettings.value?.commentEnabled ?? true);

// 获取留言板配置
const { data: messageConfig } = await useFetch("/api/messages/config", {
  headers: getInternalRequestHeaders(),
});
const messageContentId = computed(() => messageConfig.value?.data?.contentId);
const route = useRoute();

// hash 滚动相关定时器句柄：onUnmounted 统一清理，避免卸载后仍回调（重试链会残留 setTimeout）
let clearRingTimer: ReturnType<typeof setTimeout> | null = null;
let hashRetryTimer: ReturnType<typeof setTimeout> | null = null;

function scrollToComment(hash: string) {
  if (!import.meta.client) return;

  const commentId = hash.replace(/^#comment-/, "");
  if (!commentId) return;

  const element = document.getElementById(`comment-${commentId}`);
  if (!element) return;

  const headerOffset = 130;
  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

  window.scrollTo({ top: offsetPosition, behavior: "smooth" });
  element.classList.add("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
  // 记录句柄，onUnmounted 清理，避免卸载后仍对已被 Vue 替换的 DOM 操作 class（轻微残留）
  clearRingTimer = setTimeout(() => {
    element.classList.remove("ring-2", "ring-blue-500", "ring-offset-2", "dark:ring-offset-slate-900");
  }, 3000);
}

watch(
  () => route.hash,
  hash => {
    if (!hash?.startsWith("#comment-")) return;
    nextTick(() => {
      // 评论依赖两跳异步（顶层 useFetch /api/messages/config → CommentList 再加载评论），
      // 延长重试窗口（最多 ~3s）否则慢网时 1s 内元素未挂载、重试耗尽直接 return 停在顶部
      let attempts = 0;
      const maxAttempts = 30;
      const checkAndScroll = () => {
        const commentId = hash.replace(/^#comment-/, "");
        const element = document.getElementById(`comment-${commentId}`);
        if (element || attempts >= maxAttempts) scrollToComment(hash);
        else {
          attempts++;
          hashRetryTimer = setTimeout(checkAndScroll, 100);
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

const lightboxContainer = useTemplateRef<HTMLDivElement>("lightboxContainer");

// 注册画廊容器：全局灯箱在点击时才按容器内的 [data-lightbox] 收集幻灯片
const { register, unregister } = useLightbox();
// 模板 ref 会在子树卸载时被同步置 null（早于 onUnmounted 触发，见 runtime-core unmount），
// 所以挂载时把元素本身留存一份；否则卸载时传进去的是 null，注销成了空操作，
// 容器会永久留在模块级 Set 里，连同整棵已分离 DOM 一起泄漏。
let lightboxEl: HTMLElement | null = null;

// 封面加载失败时回退到 nopic
const nopicUrl = publicAsset("/imgs/nopic.png");
function handleCoverError(event: Event) {
  const target = event.target as HTMLImageElement;
  if (target) target.src = nopicUrl;
}

onMounted(() => {
  lightboxEl = lightboxContainer.value;
  register(lightboxEl);
});

onUnmounted(() => {
  unregister(lightboxEl);
  // 清理 hash 滚动相关定时器（重试链 / ring 高亮），避免卸载后仍对已替换 DOM 操作
  if (hashRetryTimer) {
    clearTimeout(hashRetryTimer);
    hashRetryTimer = null;
  }
  if (clearRingTimer) {
    clearTimeout(clearRingTimer);
    clearRingTimer = null;
  }
});
</script>

<template>
  <div class="max-w-225 mx-auto">
    <!-- 标题区域 -->
    <header ref="lightboxContainer" v-scroll-reveal>
      <!-- 封面图片 -->
      <img
        data-lightbox="gallery"
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
    <section v-scroll-reveal class="my-8">
      <!-- 未配置提示 -->
      <div v-if="!messageContentId" class="py-10 text-center">
        <Icon name="lucide:alert-circle" class="size-8 text-amber-500 mx-auto mb-2" />
        <p class="text-amber-600 dark:text-amber-400 mb-4">留言板尚未初始化</p>
        <p class="text-sm text-slate-500">请联系管理员在后台设置留言板关联文章</p>
      </div>

      <!-- 评论区 -->
      <CommentList v-else-if="commentEnabled" :content-id="messageContentId" :load-all-comments="!!route.hash && route.hash.startsWith('#comment-')" />
    </section>
  </div>
</template>
