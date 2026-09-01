<script setup lang="ts">
import { printWelcomeBanner } from "#shared/welcome-banner";
import { siteConfig } from "~~/site.config";

const route = useRoute();
const { buildHash } = useSiteSettings();

// 构建哈希：走 /api/site 下发（非 public，不进 __NUXT__ 的 runtimeConfig），SSR 插件预取，供 meta 展示。
useHead({ meta: [{ name: "build-hash", content: computed(() => buildHash.value ?? "") }] });

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

// 在导航最早期（beforeEach）预算「是否跳过位移」——这里同时启动渐出，
// 必须用 from/to 显式判定；若改用响应式 route.path，渐出启动那一刻它可能已是新页，
// 会在离开这些页面瞬间把 transform 挂到仍渲染旧页的 <main> 上致闪烁。
// 全屏固定页（首页 hero fixed 视差 / 地图 h-svh 全屏 section）：任何祖先 transform 都会为后代
// fixed/absolute 创建包含块破坏视口定位，或让全屏内容整体上下错位，故涉及这些页面的导航全程不位移。
const NO_TRANSLATE_PATHS = new Set(["/", "/map"]);
const router = useRouter();
let navSkipsTranslate = false;
// 最近一次触发渐出的目标 path。afterEach 失败回滚时比对它：只有当失败的导航仍是
// 最近一次渐出目标、且没有更新的导航接手时才回滚，避免「旧导航失败」误伤「新导航过渡」。
let pendingFadePath: string | null = null;

// 启动渐出：#main 透明度置 0、（非全屏固定页）下移。由 router.beforeEach 调用，
// 让点击瞬间就渐出——不必等 Vue Router 下载新页 chunk、跑 setup 挂起 Suspense。
// （原实现挂在 page:start，而 page:start 绑在 Suspense onPending，要等 chunk 下完才触发，
//  生产环境首访每页都要现下 JS/CSS chunk，且导航按钮用 router.push 无 NuxtLink 预取，
//  导致「点击后肉眼可见等一下才渐出」。）
function startFadeOut() {
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
}

// 取消渐出（导航被中止/重复且无新导航接手）：还原透明度，避免页面卡在渐出态。
function cancelFadeOut() {
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }
  if (fadeOutTimer) {
    clearTimeout(fadeOutTimer);
    fadeOutTimer = null;
  }
  pendingFadePath = null;
  showPageLoading.value = false;
  showLoadingTimeout.value = false;
  isPageTransitioning.value = false;
  mainOpacity.value = 1;
  mainTranslateY.value = 0;
}

router.beforeEach((to, from) => {
  navSkipsTranslate = NO_TRANSLATE_PATHS.has(from.path) || NO_TRANSLATE_PATHS.has(to.path);
  // 仅客户端 SPA 导航触发（首屏 hydration 走 first-loading 遮罩，无旧页可渐出），
  // 且路径真正变化时才渐出（hash/query-only 不触发，与原 page:start 行为一致）。
  if (import.meta.client && !nuxtApp.isHydrating && to.path !== from.path) {
    pendingFadePath = to.path;
    startFadeOut();
  }
});

router.afterEach((to, _from, failure) => {
  // 导航失败（中止/取消/重复）且仍是最近一次渐出目标 → 回滚；
  // 若已有更新的导航接手（pendingFadePath 已指向新目标），则忽略，避免误回滚新过渡。
  if (failure && pendingFadePath === to.path) {
    cancelFadeOut();
  }
});

// page:start（新页 Suspense 挂起）不再承担渐出触发——渐出已在 beforeEach 提前启动，
// transitionStartTime 记录的是点击时刻。这里保留空钩子：若在此重置 transitionStartTime，
// 会把「点击→新页挂起」之间的 chunk 下载耗时抹掉，破坏 page:finish 的剩余时长计算。
nuxtApp.hook("page:start", () => {
  // no-op：渐出已在 router.beforeEach 启动
});

// 监听页面加载完成
nuxtApp.hook("page:finish", () => {
  // 清除加载超时定时器
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }
  pendingFadePath = null;

  // 计算已过时间（自点击时刻起，含 chunk 下载/数据请求，故首次访问慢页也能正确判定渐出已耗尽）
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
  // 首屏遮罩兜底脚本：在 Vue 挂载之前就以原生 <script> 执行，独立于水合。
  // 1) 按 Esc 关闭；2) 页面 load 后若遮罩仍在（Vue 水合失败 / onMounted 未触发），
  //    10s 后自动关闭并显现所有滚动渐入元素——保证遮罩永不卡死、内容永不可见。
  //    生产 CSP 允许 'unsafe-inline'（server/utils/csp.ts），dev 不投递 CSP，均可执行。
  script: [
    {
      tagPosition: "head",
      innerHTML: `(function(){
        function hide(){
          var el=document.getElementById('first-loading');
          if(!el)return;
          var els=document.querySelectorAll('[data-scroll-reveal]:not([data-revealed])');
          for(var i=0;i<els.length;i++){els[i].setAttribute('data-revealed','');}
          el.style.display='none';
        }
        document.addEventListener('keydown',function(e){
          if((e.key==='Escape'||e.key==='Esc')&&document.getElementById('first-loading')){hide();}
        });
        window.addEventListener('load',function(){setTimeout(hide,10000);});
      })();`,
    },
  ],
  // 无 JS 环境：onclick 与兜底脚本都依赖 JS，遮罩将永久停留、滚动渐入元素永不可见。
  // 这里直接显现内容，避免 no-JS 用户面对空白页。
  noscript: [
    {
      innerHTML:
        "<style>#first-loading{display:none !important}[data-scroll-reveal]{opacity:1 !important;transform:none !important}</style>",
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
      class="fixed inset-0 z-9999 flex cursor-pointer select-none items-center justify-center bg-white dark:bg-slate-950"
      onclick="
        const fadeElements = document.querySelectorAll('[data-scroll-reveal]:not([data-revealed])');
        fadeElements.forEach(el => {
          el.setAttribute('data-revealed', '');
        });
        this.style.display = 'none';
      ">
      <div class="flex flex-col items-center gap-7">
        <!-- 品牌 wordmark：字母依次呼吸上跳，QI1 保持红色 -->
        <div class="flex items-end gap-0.5 font-serif text-5xl font-black tracking-tight max-md:text-4xl">
          <span class="loading-letter text-slate-900 dark:text-white">I</span>
          <span class="loading-letter text-slate-900 dark:text-white">M</span>
          <span class="loading-letter text-red-600 dark:text-red-500">Q</span>
          <span class="loading-letter text-red-600 dark:text-red-500">I</span>
          <span class="loading-letter text-red-600 dark:text-red-500">1</span>
          <span class="ml-1 text-xl font-bold text-slate-400 dark:text-slate-600">.COM</span>
        </div>

        <!-- 自定义扫描进度条：彗星拖尾从左掠过 -->
        <div class="relative h-1 w-52 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/80 max-md:w-44">
          <div class="loading-comet absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-blue-500 to-violet-500 shadow-[0_0_10px_rgba(59,130,246,0.65)]" />
        </div>

        <!-- 文字提示（省略号循环） -->
        <p class="text-sm text-slate-500 dark:text-slate-400 font-serif">
          正在加载中<span class="loading-ellipsis" />
        </p>
      </div>

      <!-- 兜底提示：加载耗时较长时淡入，告知可点击 / Esc 跳过（点击事件冒泡至遮罩 onclick） -->
      <p
        class="loading-skip-hint absolute bottom-8 left-1/2 -translate-x-1/2 text-center font-serif text-xs text-slate-400 dark:text-slate-600">
        加载未完成？点击任意处或按 Esc 跳过
      </p>
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

  <!-- 页面加载超时提示：仅前台显示。前台 <main> 渐出到 opacity:0 后再显（500ms > fadeDuration），
       提示落在空白背景上；后台 <NuxtPage> 无渐出，旧页仍可见，叠加提示会和页面内容重叠，故后台不显。 -->
  <div v-if="showLoadingTimeout && isFrontend" class="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
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
/* 首次加载遮罩：提升合成层，让 opacity 渐隐在合成线程运行。
   首页水合尾段主线程仍有微任务洪峰（约 283ms），若不提升，遮罩 0.3s 渐隐
   期间主线程一忙就掉帧；提升后合成线程独立插值，主线程繁忙不再卡顿。 */
#first-loading {
  will-change: opacity;
}

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

/* 品牌 wordmark：字母依次呼吸上跳 */
.loading-letter {
  display: inline-block;
  animation: loading-letter-pulse 1.4s ease-in-out infinite;
}

.loading-letter:nth-child(1) {
  animation-delay: 0s;
}

.loading-letter:nth-child(2) {
  animation-delay: 0.1s;
}

.loading-letter:nth-child(3) {
  animation-delay: 0.2s;
}

.loading-letter:nth-child(4) {
  animation-delay: 0.3s;
}

.loading-letter:nth-child(5) {
  animation-delay: 0.4s;
}

@keyframes loading-letter-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-5px);
  }
}

/* 扫描进度条：彗星拖尾从左掠到右 */
.loading-comet {
  animation: loading-comet-sweep 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes loading-comet-sweep {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(330%);
  }
}

/* 省略号循环：. → .. → ... */
.loading-ellipsis::after {
  content: "...";
  animation: loading-ellipsis 1.4s steps(1, end) infinite;
}

@keyframes loading-ellipsis {
  0% {
    content: "";
  }

  33% {
    content: ".";
  }

  66% {
    content: "..";
  }

  100% {
    content: "...";
  }
}

/* 兜底提示：加载耗时较长（2.5s）后才淡入，快加载场景用户不会看到 */
.loading-skip-hint {
  opacity: 0;
  animation: loading-hint-fade-in 0.6s ease 2.5s forwards;
}

@keyframes loading-hint-fade-in {
  to {
    opacity: 1;
  }
}

/* 尊重「减少动态效果」无障碍偏好 */
@media (prefers-reduced-motion: reduce) {
  .loading-letter,
  .loading-comet,
  .loading-ellipsis::after,
  .loading-skip-hint {
    animation: none;
  }

  .loading-letter,
  .loading-skip-hint {
    opacity: 1;
  }
}
</style>
