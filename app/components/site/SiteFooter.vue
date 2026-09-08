<script setup lang="ts">
import {siteConfig} from "~~/site.config";
import type {FooterIcon} from "~/types/components/footer";

const route = useRoute();

const currentYear = new Date().getFullYear();

// 获取页面加载状态
const pageLoading = inject<Ref<boolean>>("pageLoading", ref(false));

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth, checkAuthStatus } = useAuth();

// 使用全局站点设置
const { siteSettings, fetchSiteSettings } = useSiteSettings();

// 页脚音乐：仅当播放器可用（未被连续失败停用）时才保留胶囊位。停用后整颗胶囊连同占位
// 一起消失，同时把外层包裹节点一并移出 flex 布局，避免 0 高度 flex 项在 gap 下挤开下方按钮。
const { isDisabled: isMusicDisabled } = useAudioPlayer();

// 判断是否为首页
const isHomePage = computed(() => route.path === "/");

// 地图中心页：页脚透明浮于全屏地图之上（地图底色非白即黑，主题色文字可直接显示）
const isTravelPage = computed(() => route.path === "/map");

const siteName = computed(() => siteSettings.value?.siteName || siteConfig.siteName);
const siteIcp = computed(() => siteSettings.value?.siteIcp || "");

const blogStackIcons: FooterIcon[] = [
  {
    name: "Nuxt",
    icon: "app:nuxt",
    href: "https://nuxt.com/",
    title: "Nuxt",
    target: "_blank",
  },
  {
    name: "Prisma",
    icon: "app:prisma",
    href: "https://prisma.io/",
    title: "Prisma",
    target: "_blank",
  },
  {
    name: "PostgreSQL",
    icon: "app:postgresql",
    href: "https://www.postgresql.org/",
    title: "PostgreSQL",
    target: "_blank",
  },
];

// 使用官方 colorMode 模块
const colorMode = useColorMode();

// 移动端按钮组展开状态
const isMobileButtonsOpen = ref(false);

// 地图页毛玻璃基底：三处 shell 共用，避免重复内联同一串 class
const travelBg = "bg-linear-to-b from-white/60 to-white/85 dark:from-black/60 dark:to-black/85 backdrop-blur-[20px] text-slate-900 dark:text-slate-100";
const travelBtnShell = `border-transparent ${travelBg}`;
const footerBtnShell = computed(() =>
  isTravelPage.value ? travelBtnShell : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800",
);
const footerBtnShadow = computed(() => (isTravelPage.value ? "" : "shadow-lg"));
const toggleBtnShell = computed(() => {
  if (isTravelPage.value) {
    return `${isMobileButtonsOpen.value ? "border-red-500" : "border-transparent"} ${travelBg}`;
  }
  return isMobileButtonsOpen.value
    ? "border border-red-500 bg-white dark:bg-slate-800"
    : "border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800";
});

// 使用 computed 替代 ref + watch，减少响应式开销
const isDarkMode = computed(() => colorMode.value === "dark");

// 防抖锁，避免快速点击导致性能问题
let isTransitioning = false;

// 切换亮暗模式（优化的圆形扩散动画）
const handleClick = async (event: MouseEvent) => {
  // 防抖：如果在过渡中，直接返回
  if (isTransitioning) return;

  const x = event.clientX;
  const y = event.clientY;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  // 判断当前是否为暗色模式：用「实际解析模式」而非存储偏好（preference 可=system），
  // 与按钮 isDarkMode（colorMode.value）同源，保证切换方向始终与所示示意一致。
  const isCurrentDark = colorMode.value === "dark";
  const newMode = isCurrentDark ? "light" : "dark";

  // 设置锁
  isTransitioning = true;

  // view-transition 快照/恢复会打乱 floating-vue 的 tooltip 状态机，造成切换后 tooltip
  // 闪现一下又消失。切换开始即隐藏 tooltip，切换完成后再延迟 300ms 解除，绕开这次抖动。
  const html = document.documentElement;
  html.classList.add("theme-tooltip-suppress");
  const releaseTooltipSuppress = () => {
    setTimeout(() => html.classList.remove("theme-tooltip-suppress"), 300);
  };

  // Firefox 使用 CSS 过渡作为替代方案
  const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

  if (!document.startViewTransition || isFirefox) {
    // Firefox 降级方案：使用 CSS 类控制平滑过渡
    html.classList.add("theme-transitioning");

    colorMode.preference = newMode;

    setTimeout(() => {
      html.classList.remove("theme-transitioning");
      releaseTooltipSuppress();
      isTransitioning = false;
    }, 350);
    return;
  }

  // 使用 View Transition API
  // 先挂上 theme-color-instant：切换期间临时把所有元素自身的颜色过渡置 0s，
  // 仅由圆形扩散快照负责过渡，避免导航/logo 等自带 transition-all 的元素
  // 在快照之上再叠一遍颜色过渡，造成"颜色变得更慢"的观感
  html.classList.add("theme-color-instant");

  try {
    const transition = document.startViewTransition(async () => {
      colorMode.preference = newMode;
      await nextTick();
    });
    await transition.ready;

    // 进暗色由 old root 收缩（从大到小），进亮色由 new root 扩散（从小到大）
    const isToDark = newMode === "dark";
    const collapsed = `circle(0px at ${x}px ${y}px)`;
    const expanded = `circle(${radius}px at ${x}px ${y}px)`;
    const clipPath = isToDark ? [expanded, collapsed] : [collapsed, expanded];

    // 纯 clip-path 动画，不使用缩放
    await document.documentElement
      .animate(
        { clipPath },
        {
          duration: 350,
          easing: "cubic-bezier(0.4, 0.0, 0.2, 1)",
          fill: "forwards",
          pseudoElement: isToDark ? "::view-transition-old(root)" : "::view-transition-new(root)",
        },
      )
      .finished;
  } catch (error) {
    // transition.ready/finished 被打断（如导航中途切走）会 reject，记录但不致命
    console.error("View transition failed:", error);
  } finally {
    // 无论成功/失败/被打断都释放防抖锁与临时 class，避免主题按钮被永久锁死
    isTransitioning = false;
    html.classList.remove("theme-color-instant");
    releaseTooltipSuppress();
  }
};

// 进度圆环周长 2πr (r=12)，供 stroke-dasharray/dashoffset 使用
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 12;

// 滚动进度：连续值由 rAF 写入，三段显示状态由 computed 派生，减少每帧响应式写入
const scrollProgress = ref(0);
const roundedProgress = computed(() => Math.round(scrollProgress.value));
const showProgress = computed(() => scrollProgress.value >= 10 && scrollProgress.value < 90);
const showBackToTop = computed(() => scrollProgress.value >= 90);

const updateScrollProgress = (scrollY: number, innerHeight: number) => {
  const docHeight = document.documentElement.scrollHeight - innerHeight;
  scrollProgress.value = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
};

// 滚动进度合流到全局单一 rAF tick（见 useScrollRaf）
useScrollRaf(updateScrollProgress);

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

// 切换移动端按钮组
const toggleMobileButtons = () => {
  isMobileButtonsOpen.value = !isMobileButtonsOpen.value;
};

// 跳转到后台
const goToAdmin = () => {
  window.open("/admin");
};

onMounted(() => {
  // 检查登录状态
  checkAuthStatus();
  // 获取站点设置（每个页面都会调用，但只会实际请求一次）
  fetchSiteSettings().catch(() => {
    // 静默失败，不影响页面显示
  });
});
</script>

<template>
  <div class="z-9" :class="isTravelPage ? '' : 'bg-slate-50 dark:bg-slate-900'">
    <div
      v-if="!isTravelPage"
      class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600 dark:text-slate-400 max-sm:flex-col gap-3">
      <div v-if="!isTravelPage" class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span class="max-md:hidden"
          >· <NuxtLink aria-label="本主题已开源于 GitHub" to="https://github.com/imqi1-github/imqi1-cms" target="_blank" class="hover:underline">主题</NuxtLink></span
        >
        <span v-if="siteIcp && isHomePage" class="max-md:hidden"
          >│ <NuxtLink class="hover:underline" to="https://beian.miit.gov.cn/" target="_blank">{{ siteIcp }}</NuxtLink></span
        >
      </div>
      <div class="**:fill-slate-600 dark:**:fill-slate-400 flex gap-2 items-center">
        <ClientOnly>
          <NuxtLink v-tooltip="'RSS订阅'" to="/feed" target="_blank" aria-label="RSS订阅">
            <Icon name="ri:rss-fill" aria-hidden="true" class="size-4.5 hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
          </NuxtLink>
          <NuxtLink
            v-tooltip="'本站内容采用CC BY-NC-ND 4.0协议授权'"
            to="https://creativecommons.org/licenses/by/4.0/deed.zh-hans"
            target="_blank"
            aria-label="本站内容采用 CC BY-NC-ND 4.0 协议授权"
            class="flex items-center **:size-4.5 **:fill-state-600 group">
            <Icon name="ri:copyright-line" aria-hidden="true" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-by-line" aria-hidden="true" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-nc-line" aria-hidden="true" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-nd-line" aria-hidden="true" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
          </NuxtLink>
          <!-- 技术栈图标 -->
          <div aria-hidden="true" class="border border-gray-300 dark:border-gray-600 h-3"/>
          <template v-for="iconItem in blogStackIcons" :key="iconItem.name">
            <NuxtLink v-tooltip="iconItem.title" :to="iconItem.href" :target="iconItem.target" :aria-label="iconItem.title" class="no-underline">
              <Icon :name="iconItem.icon" aria-hidden="true" class="text-lg hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
            </NuxtLink>
          </template>
        </ClientOnly>
      </div>
    </div>
    <!-- 右下角按钮组 -->
    <div class="fixed bottom-8 right-8 z-9999 flex flex-col gap-3 items-end max-md:gap-1 max-md:bottom-4 max-md:right-4">
      <!-- PC端：页面加载图标 -->
      <ClientOnly>
        <Transition name="fade">
          <button
            v-if="pageLoading"
            v-tooltip="'页面加载中'"
            type="button"
            aria-label="页面加载中"
            class="cursor-pointer rounded-full p-1.5 flex items-center justify-center transition-all duration-300 aspect-square size-7.5 max-md:hidden"
            :class="footerBtnShell">
            <Icon name="lucide:loader-2" aria-hidden="true" class="size-4 text-gray-600 dark:text-gray-300 animate-spin" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- PC端：返回顶部/进度按钮 -->
      <ClientOnly>
        <Transition name="fade">
          <button
            v-if="showProgress || showBackToTop"
            v-tooltip="'返回顶部'"
            type="button"
            :aria-label="showProgress ? `返回顶部，当前阅读进度 ${roundedProgress}%` : '返回顶部'"
            class="cursor-pointer relative rounded-full p-1.5 flex items-center justify-center transition-all duration-300 aspect-square size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600"
            :class="footerBtnShell"
            @click="scrollToTop">
            <!-- 进度圆环 -->
            <Transition name="icon-fade" mode="out-in">
              <svg v-if="showProgress" key="progress" aria-hidden="true" class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 28 28">
                <circle
                  cx="14"
                  cy="14"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  class="text-gray-900 dark:text-gray-100"
                  :stroke-dasharray="PROGRESS_CIRCUMFERENCE"
                  :stroke-dashoffset="PROGRESS_CIRCUMFERENCE - (PROGRESS_CIRCUMFERENCE * scrollProgress) / 100" />
              </svg>
              <div v-else-if="showBackToTop" key="arrow" aria-hidden="true" class="absolute inset-0 flex items-center justify-center">
                <Icon name="ri:arrow-up-line" aria-hidden="true" class="size-4 text-gray-600 dark:text-gray-300" />
              </div>
            </Transition>
            <!-- 进度数字 -->
            <Transition name="icon-fade" mode="out-in">
              <span v-if="showProgress" key="number" aria-hidden="true" class="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {{ roundedProgress }}
              </span>
            </Transition>
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：页面加载图标 -->
      <ClientOnly>
        <Transition name="btn-pop">
          <button
            v-if="pageLoading"
            v-tooltip="'页面加载中'"
            type="button"
            aria-label="页面加载中"
            class="rounded-full p-2 flex items-center justify-center md:hidden"
            :class="[footerBtnShell, footerBtnShadow]">
            <Icon name="lucide:loader-2" aria-hidden="true" class="size-5 text-gray-600 dark:text-gray-300 animate-spin" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：返回顶部按钮 -->
      <ClientOnly>
        <Transition name="btn-pop">
          <button
            v-show="isMobileButtonsOpen"
            v-tooltip="'返回顶部'"
            type="button"
            aria-label="返回顶部"
            class="rounded-full p-2 flex items-center justify-center md:hidden"
            :class="[footerBtnShell, footerBtnShadow]"
            @click="scrollToTop">
            <Icon name="ri:arrow-up-line" aria-hidden="true" class="size-5 text-gray-600 dark:text-gray-300" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：主题切换按钮 -->
      <ClientOnly>
        <Transition name="btn-pop">
          <button
            v-show="isMobileButtonsOpen"
            v-tooltip="isDarkMode ? '亮色模式' : '暗色模式'"
            type="button"
            :aria-pressed="isDarkMode"
            :aria-label="isDarkMode ? '当前为暗色模式，点击切换为亮色模式' : '当前为亮色模式，点击切换为暗色模式'"
            class="rounded-full p-2 flex items-center justify-center md:hidden"
            :class="[footerBtnShell, footerBtnShadow]"
            @click="handleClick">
            <Icon v-if="!isDarkMode" name="ri:sun-line" aria-hidden="true" class="size-5 text-gray-600 dark:text-gray-300" />
            <Icon v-else name="ri:moon-line" aria-hidden="true" class="size-5 text-gray-100 dark:text-gray-300" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：后台管理按钮（仅登录时显示） -->
      <ClientOnly>
        <Transition name="btn-pop">
          <button
            v-show="isMobileButtonsOpen && isLoggedIn && !isLoadingAuth"
            v-tooltip="'后台管理'"
            type="button"
            aria-label="后台管理"
            class="rounded-full p-2 flex items-center justify-center md:hidden"
            :class="[footerBtnShell, footerBtnShadow]"
            @click="goToAdmin">
            <Icon name="lucide:layout-dashboard" aria-hidden="true" class="size-5 text-gray-600 dark:text-gray-300" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 音乐播放器 -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-y-4 scale-75"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition-all duration-200"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-4 scale-75">
        <div v-show="isMobileButtonsOpen && !isMusicDisabled" class="md:hidden">
          <FooterMusic />
        </div>
      </Transition>

      <!-- PC端：暗黑模式切换按钮 -->
      <ClientOnly>
        <button
          v-tooltip="isDarkMode ? '亮色模式' : '暗色模式'"
          type="button"
          :aria-pressed="isDarkMode"
          :aria-label="isDarkMode ? '当前为暗色模式，点击切换为亮色模式' : '当前为亮色模式，点击切换为暗色模式'"
          class="cursor-pointer rounded-full p-1.5 flex items-center justify-center transition-all duration-300 size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600"
          :class="footerBtnShell"
          @click="handleClick">
          <Icon v-if="!isDarkMode" name="ri:sun-line" aria-hidden="true" class="size-4 text-gray-600 dark:text-gray-300" />
          <Icon v-else name="ri:moon-line" aria-hidden="true" class="size-4 text-gray-100 dark:text-gray-300" />
        </button>
      </ClientOnly>

      <!-- PC端：后台管理按钮（仅登录时显示） -->
      <ClientOnly>
        <button
          v-if="isLoggedIn && !isLoadingAuth"
          v-tooltip="'后台管理'"
          type="button"
          aria-label="后台管理"
          class="cursor-pointer rounded-full p-1.5 flex items-center justify-center transition-all duration-300 size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600"
          :class="footerBtnShell"
          @click="goToAdmin">
          <Icon name="lucide:layout-dashboard" aria-hidden="true" class="size-4 text-gray-600 dark:text-gray-300" />
        </button>
      </ClientOnly>

      <!-- PC端：页脚音乐播放器 -->
      <div v-if="!isMusicDisabled" class="max-md:hidden">
        <FooterMusic />
      </div>

      <!-- 移动端：菜单切换按钮 -->
      <ClientOnly>
        <button
          v-tooltip="isMobileButtonsOpen ? '收起' : '展开'"
          class="rounded-full border p-2 flex items-center justify-center transition-all duration-300 md:hidden"
          :class="[toggleBtnShell, footerBtnShadow]"
          @click="toggleMobileButtons">
          <Icon
            :name="isMobileButtonsOpen ? 'ri:close-large-line' : 'ri:menu-line'"
            class="size-5"
            :class="isMobileButtonsOpen ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'" />
        </button>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}

/* 移动端按钮弹出/收起（5 处 Transition name="btn-pop" 共用） */
.btn-pop-enter-active {
  transition: all 0.3s ease;
}
.btn-pop-leave-active {
  transition: all 0.2s ease;
}
.btn-pop-enter-from,
.btn-pop-leave-to {
  opacity: 0;
  transform: translateY(1rem) scale(0.75);
}

/* 按钮整体出现/消失（进度 < 10% 时隐藏 ↔ 显示） */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.75);
}

/* 进度圆环 ↔ 返回顶部箭头 之间的切换（mode="out-in"） */
.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.icon-fade-enter-from {
  opacity: 0;
  transform: scale(0.7);
}
.icon-fade-leave-to {
  opacity: 0;
  transform: scale(0.7);
}
</style>
