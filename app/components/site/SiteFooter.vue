<script setup lang="ts">
const route = useRoute();
const router = useRouter();

const currentYear = new Date().getFullYear();

// 获取页面加载状态
const pageLoading = inject<Ref<boolean>>("pageLoading", ref(false));

// 判断是否为首页
const isHomePage = computed(() => route.path === "/");

// 获取站点设置
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");
const siteIcp = computed(() => data.value?.data?.siteIcp || "");

// 页脚图标数据
interface FooterIcon {
  name: string;
  icon: string; // 图标组件名
  href: string;
  title: string;
  target?: string;
}

// 博客导航图标（仅首页显示）
const blogNavIcons: FooterIcon[] = [
  {
    name: "开往",
    icon: "ri:subway-fill",
    href: "https://www.travellings.cn/go-by-clouds.html",
    title: "开往 - 友谊链接探索",
    target: "_blank",
  },
  {
    name: "虫洞",
    icon: "boxicons:planet-filled",
    href: "https://foreverblog.cn/go.html",
    title: "虫洞 - 随机访问博客",
    target: "_blank",
  },
];

const blogStackIcons: FooterIcon[] = [
  {
    name: "Nuxt",
    icon: "material-icon-theme:nuxt",
    href: "https://nuxt.com/",
    title: "Nuxt",
    target: "_blank",
  },
  {
    name: "Prisma",
    icon: "file-icons:prisma",
    href: "https://prisma.io/",
    title: "Prisma",
    target: "_blank",
  },
  {
    name: "MySQL",
    icon: "vscode-icons:file-type-mysql",
    href: "https://www.mysql.com/",
    title: "MySQL",
    target: "_blank",
  }
]

// 使用官方 colorMode 模块
const colorMode = useColorMode();

// 移动端按钮组展开状态
const isMobileButtonsOpen = ref(false);

// 按钮引用
const themeButtonRef = ref<HTMLElement | null>(null);

// 使用 computed 替代 ref + watch，减少响应式开销
const isDarkMode = computed(() => colorMode.value === "dark");

// 防抖锁，避免快速点击导致性能问题
let isTransitioning = false;

// 切换亮暗模式（极致性能优化 + 圆形扩散动画）
const handleClick = async (event: MouseEvent) => {
  // 防抖：如果在过渡中，直接返回
  if (isTransitioning) return;

  const x = event.clientX;
  const y = event.clientY;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  // 判断当前是否为暗色模式
  const isCurrentDark = colorMode.preference === "dark";
  const newMode = isCurrentDark ? "light" : "dark";

  // 设置锁
  isTransitioning = true;

  if (!document.startViewTransition) {
    colorMode.preference = newMode;
    // 300ms 后释放锁（动画时间）
    setTimeout(() => {
      isTransitioning = false;
    }, 300);
    return;
  }

  const transition = document.startViewTransition(async () => {
    colorMode.preference = newMode;
    await nextTick();
  });

  transition.ready.then(() => {
    // 切换到暗色：isToDark = true，old（亮色）收缩
    // 切换到亮色：isToDark = false，new（亮色）扩散
    const isToDark = newMode === "dark";
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`];

    const animation = document.documentElement.animate(
      {
        clipPath: isToDark ? clipPath.reverse() : clipPath,
      },
      {
        duration: 300,
        easing: "ease-in-out",
        fill: "forwards",
        pseudoElement: isToDark ? "::view-transition-old(root)" : "::view-transition-new(root)",
      },
    );

    // 动画完成后释放锁
    animation.finished.then(() => {
      isTransitioning = false;
    });
  });

  // 如果 transition 失败，也要释放锁
  transition.finished.catch(() => {
    isTransitioning = false;
  });
};

// 滚动进度
const scrollProgress = ref(0);
const showBackToTop = ref(false);
const showProgress = ref(false);

const updateScrollProgress = () => {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;

  if (docHeight > 0) {
    scrollProgress.value = (scrollTop / docHeight) * 100;
  } else {
    scrollProgress.value = 0;
  }

  // 10%以下不显示
  if (scrollProgress.value < 10) {
    showBackToTop.value = false;
    showProgress.value = false;
  }
  // 10%-90% 显示进度圆环
  else if (scrollProgress.value < 90) {
    showBackToTop.value = false;
    showProgress.value = true;
  }
  // 90%以上显示返回顶部箭头
  else {
    showBackToTop.value = true;
    showProgress.value = false;
  }
};

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

onMounted(() => {
  window.addEventListener("scroll", updateScrollProgress);
  updateScrollProgress();
});

onUnmounted(() => {
  window.removeEventListener("scroll", updateScrollProgress);
});
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900">
    <div class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600 dark:text-slate-400">
      <div class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span v-if="siteIcp"
          >│ <NuxtLink class="hover:underline" to="https://beian.miit.gov.cn/" target="_blank">{{ siteIcp }}</NuxtLink></span
        >
      </div>
      <div class="**:fill-slate-600 dark:**:fill-slate-400 flex gap-2 items-center">
        <NuxtLink to="/feed" target="_blank" title="RSS订阅">
          <Icon name="ri:rss-fill" class="size-4.5 hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
        </NuxtLink>
        <NuxtLink
          to="https://creativecommons.org/licenses/by/4.0/deed.zh-hans"
          target="_blank"
          class="flex items-center **:size-4.5 **:fill-state-600 group"
          title="CC BY 4.0">
          <Icon name="ri:copyright-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
          <Icon name="ri:creative-commons-by-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
          <Icon name="ri:creative-commons-nc-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
          <Icon name="ri:creative-commons-nd-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
        </NuxtLink>
        <!-- 技术栈图标 -->
        <div class="border border-gray-300 dark:border-gray-600 h-3"></div>
        <template v-for="iconItem in blogStackIcons" :key="iconItem.name">
          <NuxtLink :to="iconItem.href" :target="iconItem.target" :title="iconItem.title" class="no-underline">
            <Icon :name="iconItem.icon" class="text-lg hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
          </NuxtLink>
        </template>
        <!-- 博客导航图标（仅首页显示） -->
        <div v-if="isHomePage" class="border border-gray-300 dark:border-gray-600 h-3"></div>
        <template v-if="isHomePage" v-for="iconItem in blogNavIcons" :key="iconItem.name">
          <NuxtLink :to="iconItem.href" :target="iconItem.target" :title="iconItem.title" class="no-underline">
            <Icon :name="iconItem.icon" class="text-lg hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
          </NuxtLink>
        </template>
      </div>
    </div>
    <!-- 右下角按钮组 -->
    <div class="fixed bottom-8 right-8 z-9999 flex flex-col gap-3 items-end max-md:gap-1 max-md:bottom-4 max-md:right-4">
      <!-- PC端：页面加载图标 -->
      <Transition name="fade">
        <button
          v-if="pageLoading"
          class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 aspect-square size-7.5 max-md:hidden"
          title="页面加载中">
          <Icon name="lucide:loader-2" class="size-4 text-gray-600 dark:text-gray-300 animate-spin" />
        </button>
      </Transition>

      <!-- PC端：返回顶部/进度按钮 -->
      <Transition name="fade">
        <button
          v-if="showProgress || showBackToTop"
          @click="scrollToTop"
          class="cursor-pointer relative rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 aspect-square size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600"
          title="返回顶部">
          <!-- 进度圆环 -->
          <Transition name="icon-fade" mode="out-in">
            <svg v-if="showProgress" key="progress" class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 28 28">
              <circle
                cx="14"
                cy="14"
                r="12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                class="text-gray-900 dark:text-gray-100"
                :stroke-dasharray="75.4"
                :stroke-dashoffset="75.4 - (75.4 * scrollProgress) / 100" />
            </svg>
            <div v-else-if="showBackToTop" key="arrow" class="absolute inset-0 flex items-center justify-center">
              <Icon name="ri:arrow-up-line" class="size-4 text-gray-600 dark:text-gray-300" />
            </div>
          </Transition>
          <!-- 进度数字 -->
          <Transition name="icon-fade" mode="out-in">
            <span v-if="showProgress" key="number" class="text-[10px] font-medium text-gray-600 dark:text-gray-300">
              {{ Math.round(scrollProgress) }}
            </span>
          </Transition>
        </button>
      </Transition>

      <!-- 移动端：页面加载图标 -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-y-4 scale-75"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition-all duration-200"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-4 scale-75">
        <button
          v-if="pageLoading"
          class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden"
          data-tip="页面加载中">
          <Icon name="lucide:loader-2" class="size-5 text-gray-600 dark:text-gray-300 animate-spin" />
        </button>
      </Transition>

      <!-- 移动端：返回顶部按钮 -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-y-4 scale-75"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition-all duration-200"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-4 scale-75">
        <button
          v-show="isMobileButtonsOpen"
          @click="scrollToTop"
          class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden"
          data-tip="返回顶部">
          <Icon name="ri:arrow-up-line" class="size-5 text-gray-600 dark:text-gray-300" />
        </button>
      </Transition>

      <!-- 移动端：主题切换按钮 -->
      <ClientOnly>
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 translate-y-4 scale-75"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-4 scale-75">
          <button
            v-show="isMobileButtonsOpen"
            @click="handleClick"
            class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden"
            :data-tip="isDarkMode ? '切换到亮色模式' : '切换到暗色模式'">
            <Icon v-if="!isDarkMode" name="ri:sun-line" class="size-5 text-gray-600 dark:text-gray-300" />
            <Icon v-else name="ri:moon-line" class="size-5 text-gray-100 dark:text-gray-300" />
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
        <div v-show="isMobileButtonsOpen" class="md:hidden">
          <FooterMusic />
        </div>
      </Transition>

      <!-- PC端：暗黑模式切换按钮 -->
      <ClientOnly>
        <button
          @click="handleClick"
          class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600"
          :title="isDarkMode ? '切换到亮色模式' : '切换到暗色模式'">
          <Icon v-if="!isDarkMode" name="ri:sun-line" class="size-4 text-gray-600 dark:text-gray-300" />
          <Icon v-else name="ri:moon-line" class="size-4 text-gray-100 dark:text-gray-300" />
        </button>
      </ClientOnly>

      <!-- PC端：页脚音乐播放器 -->
      <FooterMusic class="max-md:hidden" />

      <!-- 移动端：菜单切换按钮 -->
      <button
        @click="toggleMobileButtons"
        class="rounded-full border p-2 flex items-center justify-center shadow-lg transition-all duration-300 md:hidden"
        :class="isMobileButtonsOpen ? 'border-red-500 bg-white dark:bg-slate-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800'"
        :data-tip="isMobileButtonsOpen ? '收起' : '展开'">
        <Icon
          :name="isMobileButtonsOpen ? 'ri:close-large-line' : 'ri:menu-line'"
          class="size-5"
          :class="isMobileButtonsOpen ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.icon-fade-enter-active,
.icon-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.icon-fade-enter-from,
.icon-fade-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
