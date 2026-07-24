<script setup lang="ts">
import { printWelcomeBanner } from "../lib/welcome-banner";

import { siteConfig } from "~~/site.config";

const route = useRoute();

// 加载页品牌文字（站点域名大写形式）
const brandDomain = new URL(siteConfig.siteUrl).host.toUpperCase();

// 应用滚动条主题
useScrollbarTheme();

// 判断是否是前台页面（非后台）
const isFrontend = computed(() => !route.path.startsWith("/admin") && route.path !== "/login");
const showFirstLoading = ref(true);

// 页面加载状态
const showPageLoading = ref(false);
const showLoadingTimeout = ref(false);
let loadingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

// 页面过渡状态
const isPageTransitioning = ref(false);
const mainOpacity = ref(1);
// 渐出/渐入的位移量：非「全屏固定页」间导航叠加（首页 hero fixed 视差 / 地图全屏 section，由 navSkipsTranslate 控制跳过）
const mainTranslateY = ref(0);
const TRANSLATE_Y = siteConfig.pageTransition.translateY;
let transitionStartTime = 0;
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
const FADE_OUT_DURATION = siteConfig.pageTransition.fadeDuration; // 淡出动画时长

// 监听页面开始加载
const nuxtApp = useNuxtApp();

// 在导航最早期预算「是否跳过位移」—— page:start 触发时 route.path 已是新页，
// 直接用 route.path 判定会在离开这些页面瞬间把 transform 挂到仍渲染旧页的 <main> 上致闪烁。
// 全屏固定页（首页 hero fixed 视差 / 地图 h-svh 全屏 section）：任何祖先 transform 都会为后代
// fixed/absolute 创建包含块破坏视口定位，或让全屏内容整体上下错位，故涉及这些页面的导航全程不位移。
const NO_TRANSLATE_PATHS = new Set(["/", "/map"]);
const router = useRouter();
let navSkipsTranslate = false;
router.beforeEach((to, from) => {
  navSkipsTranslate = NO_TRANSLATE_PATHS.has(from.path) || NO_TRANSLATE_PATHS.has(to.path);
});

nuxtApp.hook("page:start", () => {
  // 清除之前的定时器
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }
  if (fadeOutTimer) {
    clearTimeout(fadeOutTimer);
    fadeOutTimer = null;
  }

  // 重置状态
  showPageLoading.value = true;
  showLoadingTimeout.value = false;
  isPageTransitioning.value = true;
  transitionStartTime = Date.now();

  // 立即开始淡出（涉及首页/地图等全屏固定页则不位移，保护 hero 与全屏布局）
  mainOpacity.value = 0;
  mainTranslateY.value = navSkipsTranslate ? 0 : TRANSLATE_Y;

  // 设置定时器，500ms 后显示加载提示（超过 fadeDuration，渐出期不会误显）
  loadingTimeoutTimer = setTimeout(() => {
    showLoadingTimeout.value = true;
  }, 500);
});

// 监听页面加载完成
nuxtApp.hook("page:finish", () => {
  // 清除加载超时定时器
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }

  // 计算已过时间
  const elapsedTime = Date.now() - transitionStartTime;
  const remainingFadeOutTime = Math.max(0, FADE_OUT_DURATION - elapsedTime);

  // 如果页面加载很快（淡出动画未完成），需要等待淡出完成
  if (remainingFadeOutTime > 0 && isFrontend.value) {
    fadeOutTimer = setTimeout(() => {
      finishPageTransition();
    }, remainingFadeOutTime);
  } else {
    // 淡出已完成或后台页面，直接显示内容
    finishPageTransition();
  }

  function finishPageTransition() {
    // 等待 Vue 更新 DOM 后再淡入，避免样式冲突
    nextTick(() => {
      // 重置状态，触发淡入动画（渐出若设了位移，此处 14→0 即「向上移动」渐入）
      showLoadingTimeout.value = false;
      showPageLoading.value = false;
      isPageTransitioning.value = false;
      mainOpacity.value = 1;
      mainTranslateY.value = 0;
    });
  }
});

// 提供给子组件
provide("pageLoading", readonly(showPageLoading));

// 全局 SEO 元信息（仅动态内容）
const siteUrl = siteConfig.siteUrl;

useHead({
  link: [
    {
      rel: "canonical",
      href: computed(() => siteUrl + route.path),
    },
  ],
  meta: [
    {
      property: "og:url",
      content: computed(() => siteUrl + route.path),
    },
  ],
});

// 滚动到 Hash 对应的元素
function scrollToHash() {
  if (!import.meta.client) return;

  const hash = route.hash;
  if (!hash) return;

  // 移除 # 符号
  const id = hash.slice(1);
  if (!id) return;

  // 等待 DOM 更新完成
  nextTick(() => {
    const element = document.getElementById(id);
    if (element) {
      // 导航栏高度偏移（pt-20 = 5rem = 80px）
      const offset = 90;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  });
}

// 监听路由变化，处理 Hash 滚动
watch(
  () => route.hash,
  () => {
    scrollToHash();
  },
  { immediate: true },
);

onMounted(() => {
  // 页面加载完成后，延迟隐藏首次加载遮罩
  showFirstLoading.value = false;

  printWelcomeBanner();
});
</script>

<template>
  <!-- 首次加载遮罩 -->
  <Transition name="first-loading">
    <div
      v-if="showFirstLoading && isFrontend"
      id="first-loading"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-white dark:bg-slate-950"
      onclick="
        const fadeElements = document.querySelectorAll('[data-scroll-reveal]:not([data-revealed])');
        fadeElements.forEach(el => {
          el.setAttribute('data-revealed', '');
        });
        this.style.display = 'none';
      ">
      <div class="flex flex-col items-center gap-6">
        <div class="animate-spin">
          <Icon name="lucide:loader-2" class="size-12 text-blue-600 dark:text-blue-400" mode="svg" />
        </div>
        <div class="text-center">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 font-serif mb-2">正在加载中...</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 font-serif">{{ brandDomain }}</p>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 前台布局：Header 和 Footer 不刷新 -->
  <template v-if="isFrontend">
    <div class="min-h-screen flex flex-col">
      <a
        href="#main"
        class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10000 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-blue-600 focus:text-white focus:shadow-lg focus:outline-none">
        跳转到主要内容
      </a>
      <SiteHeader />
      <main
        id="main"
        tabindex="-1"
        class="bg-white dark:bg-slate-950 flex pt-20 px-5 pb-10 grow z-1"
        :style="{
          transition: `opacity ${siteConfig.pageTransition.fadeDuration}ms ease, transform ${siteConfig.pageTransition.fadeDuration}ms ease`,
          opacity: mainOpacity,
          // 位移为 0 时不渲染 transform（避免稳态 translateY(0) 创建包含块破坏后代 fixed 定位）
          transform: mainTranslateY ? `translateY(${mainTranslateY}px)` : undefined,
        }">
        <NuxtPage class="font-serif font-[450] grow" />
      </main>
      <SiteFooter class="font-serif font-[450]" />
    </div>
  </template>

  <!-- 后台布局：直接显示页面 -->
  <template v-else>
    <NuxtPage />
  </template>

  <!-- 页面加载超时提示 -->
  <div v-if="showLoadingTimeout" class="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
    <div class="flex items-center gap-4">
      <div class="animate-spin">
        <Icon name="lucide:loader-2" class="size-5 text-blue-600 dark:text-blue-400" mode="svg" />
      </div>
      <div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 font-serif">页面加载中...</h3>
      </div>
    </div>
  </div>

  <Toaster />
  <LazyContextMenu class="right-button" />
  <FrontNotification />
</template>

<style scoped>
/* 首次加载遮罩过渡动画 */
.first-loading-enter-active,
.first-loading-leave-active {
  transition: opacity 0.5s ease;
}

.first-loading-enter-from,
.first-loading-leave-to {
  opacity: 0;
}

.first-loading-enter-to,
.first-loading-leave-from {
  opacity: 1;
}

/* 首次加载遮罩的淡出效果 */
.first-loading-leave-active {
  transition: opacity 0.3s ease;
}
</style>
