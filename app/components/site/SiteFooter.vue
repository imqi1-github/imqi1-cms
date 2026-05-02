<script setup lang="ts">
const route = useRoute();
const router = useRouter();

const currentYear = new Date().getFullYear();

// 获取页面加载状态
const pageLoading = inject<Ref<boolean>>("pageLoading", ref(false));

// 使用全局认证状态
const { isLoggedIn, isLoadingAuth, checkAuthStatus } = useAuth();

// 使用全局站点设置
const { siteSettings, fetchSiteSettings } = useSiteSettings();

// 判断是否为首页
const isHomePage = computed(() => route.path === "/");

const siteName = computed(() => siteSettings.value?.siteName || "ImQi1");
const siteIcp = computed(() => siteSettings.value?.siteIcp || "");

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
  },
];

// 使用统一的主题切换 composable
const { isDark: isDarkMode, toggleTheme } = useThemeToggle();

// 移动端按钮组展开状态
const isMobileButtonsOpen = ref(false);

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

// 跳转到后台
const goToAdmin = () => {
  window.open("/admin");
};

onMounted(() => {
  window.addEventListener("scroll", updateScrollProgress);
  updateScrollProgress();
  // 检查登录状态
  checkAuthStatus();
  // 获取站点设置（每个页面都会调用，但只会实际请求一次）
  fetchSiteSettings().catch(() => {
    // 静默失败，不影响页面显示
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", updateScrollProgress);
});
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 z-9">
    <div
      class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600 dark:text-slate-400 max-sm:flex-col gap-3">
      <div class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span v-if="siteIcp && isHomePage" class="max-md:hidden"
          >│ <NuxtLink class="hover:underline" to="https://beian.miit.gov.cn/" target="_blank">{{ siteIcp }}</NuxtLink></span
        >
      </div>
      <div class="**:fill-slate-600 dark:**:fill-slate-400 flex gap-2 items-center">
        <ClientOnly>
          <NuxtLink to="/feed" target="_blank" v-tooltip="'RSS订阅'">
            <Icon name="ri:rss-fill" class="size-4.5 hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
          </NuxtLink>
          <NuxtLink
            to="https://creativecommons.org/licenses/by/4.0/deed.zh-hans"
            target="_blank"
            class="flex items-center **:size-4.5 **:fill-state-600 group"
            v-tooltip="'本站内容采用CC BY-NC-ND 4.0协议授权'">
            <Icon name="ri:copyright-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-by-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-nc-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
            <Icon name="ri:creative-commons-nd-line" class="group-hover:text-blue-600 duration-300 dark:group-hover:text-gray-200" />
          </NuxtLink>
          <!-- 技术栈图标 -->
          <div class="border border-gray-300 dark:border-gray-600 h-3"></div>
          <template v-for="iconItem in blogStackIcons" :key="iconItem.name">
            <NuxtLink :to="iconItem.href" :target="iconItem.target" v-tooltip="iconItem.title" class="no-underline">
              <Icon :name="iconItem.icon" class="text-lg hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
            </NuxtLink>
          </template>
          <!-- 博客导航图标（仅首页显示） -->
          <div v-if="isHomePage" class="border border-gray-300 dark:border-gray-600 h-3"></div>
          <template v-if="isHomePage" v-for="iconItem in blogNavIcons" :key="iconItem.name">
            <NuxtLink :to="iconItem.href" :target="iconItem.target" v-tooltip="iconItem.title" class="no-underline">
              <Icon :name="iconItem.icon" class="text-lg hover:text-blue-600 dark:hover:text-gray-200 duration-300" />
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
            class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 aspect-square size-7.5 max-md:hidden">
            <Icon name="lucide:loader-2" class="size-4 text-gray-600 dark:text-gray-300 animate-spin" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- PC端：返回顶部/进度按钮 -->
      <ClientOnly>
        <Transition name="fade">
          <button
            v-if="showProgress || showBackToTop"
            @click="scrollToTop"
            v-tooltip="'返回顶部'"
            class="cursor-pointer relative rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 aspect-square size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600">
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
      </ClientOnly>

      <!-- 移动端：页面加载图标 -->
      <ClientOnly>
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 translate-y-4 scale-75"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-4 scale-75">
          <button
            v-if="pageLoading"
            v-tooltip="'页面加载中'"
            class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden">
            <Icon name="lucide:loader-2" class="size-5 text-gray-600 dark:text-gray-300 animate-spin" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：返回顶部按钮 -->
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
            @click="scrollToTop"
            v-tooltip="'返回顶部'"
            class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden">
            <Icon name="ri:arrow-up-line" class="size-5 text-gray-600 dark:text-gray-300" />
          </button>
        </Transition>
      </ClientOnly>

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
            @click="toggleTheme"
            v-tooltip="isDarkMode ? '亮色模式' : '暗色模式'"
            class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden">
            <Icon v-if="!isDarkMode" name="ri:sun-line" class="size-5 text-gray-600 dark:text-gray-300" />
            <Icon v-else name="ri:moon-line" class="size-5 text-gray-100 dark:text-gray-300" />
          </button>
        </Transition>
      </ClientOnly>

      <!-- 移动端：后台管理按钮（仅登录时显示） -->
      <ClientOnly>
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 translate-y-4 scale-75"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-4 scale-75">
          <button
            v-show="isMobileButtonsOpen && isLoggedIn && !isLoadingAuth"
            @click="goToAdmin"
            v-tooltip="'后台管理'"
            class="rounded-full border border-gray-200 dark:border-gray-700 p-2 flex items-center justify-center bg-white dark:bg-slate-800 shadow-lg md:hidden">
            <Icon name="lucide:layout-dashboard" class="size-5 text-gray-600 dark:text-gray-300" />
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
          @click="toggleTheme"
          v-tooltip="isDarkMode ? '亮色模式' : '暗色模式'"
          class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600">
          <Icon v-if="!isDarkMode" name="ri:sun-line" class="size-4 text-gray-600 dark:text-gray-300" />
          <Icon v-else name="ri:moon-line" class="size-4 text-gray-100 dark:text-gray-300" />
        </button>
      </ClientOnly>

      <!-- PC端：后台管理按钮（仅登录时显示） -->
      <ClientOnly>
        <button
          v-if="isLoggedIn && !isLoadingAuth"
          @click="goToAdmin"
          v-tooltip="'后台管理'"
          class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 size-7.5 hover:border-blue-700 max-md:hidden dark:hover:border-blue-600">
          <Icon name="lucide:layout-dashboard" class="size-4 text-gray-600 dark:text-gray-300" />
        </button>
      </ClientOnly>

      <!-- PC端：页脚音乐播放器 -->
      <FooterMusic class="max-md:hidden" />

      <!-- 移动端：菜单切换按钮 -->
      <ClientOnly>
        <button
          @click="toggleMobileButtons"
          v-tooltip="isMobileButtonsOpen ? '收起' : '展开'"
          class="rounded-full border p-2 flex items-center justify-center shadow-lg transition-all duration-300 md:hidden"
          :class="
            isMobileButtonsOpen ? 'border-red-500 bg-white dark:bg-slate-800' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800'
          ">
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
