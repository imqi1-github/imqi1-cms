<script setup lang="ts">
import {
  RiArrowUpLine,
  RiCopyrightLine,
  RiCreativeCommonsByLine,
  RiCreativeCommonsNcLine,
  RiCreativeCommonsNdLine,
  RiEarthFill,
  RiMoonLine,
  RiRssFill,
  RiSubwayFill,
  RiSunLine,
} from "@remixicon/vue";

const currentYear = new Date().getFullYear();

// 获取站点设置
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");
const siteIcp = computed(() => data.value?.data?.siteIcp || "");

// 使用官方 colorMode 模块
const colorMode = useColorMode();

// 按钮引用
const themeButtonRef = ref<HTMLElement | null>(null);

// 切换亮暗模式（带圆形扩散动画）
const handleClick = async (event: MouseEvent) => {
  const x = event.clientX;
  const y = event.clientY;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  if (!document.startViewTransition) {
    colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
    return;
  }

  const transition = document.startViewTransition(async () => {
    colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
    await nextTick();
  });

  transition.ready.then(() => {
    // 切换后 colorMode.value 已经是新的值
    // 切换到暗色：colorMode.value === "dark"，old（亮色）收缩
    // 切换到亮色：colorMode.value === "light"，new（亮色）扩散
    const isToDark = colorMode.value === "dark";
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`];

    document.documentElement.animate(
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

onMounted(() => {
  window.addEventListener("scroll", updateScrollProgress);
  updateScrollProgress();
});

onUnmounted(() => {
  window.removeEventListener("scroll", updateScrollProgress);
});
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
    <div class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600 dark:text-slate-400">
      <div class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span v-if="siteIcp"
          >│ <NuxtLink class="hover:underline" to="https://beian.miit.gov.cn/" target="_blank">{{ siteIcp }}</NuxtLink></span
        >
      </div>
      <div class="**:fill-slate-600 dark:**:fill-slate-400 flex gap-2 items-center">
        <RiRssFill class="size-4.5" />
        <div class="flex items-center **:size-4.5 **:fill-state-600">
          <RiCopyrightLine />
          <RiCreativeCommonsByLine />
          <RiCreativeCommonsNcLine />
          <RiCreativeCommonsNdLine />
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 1024 1024" width="16" height="16">
          <path
            d="M512 1024C132.647 1024 0 891.313 0 512S132.647 0 512 0s512 132.687 512 512-132.647 512-512 512zM236.308 354.462h551.384v-78.77H236.308v78.77z m0 196.923h393.846v-78.77H236.308v78.77z m0 196.923h472.615v-78.77H236.308v78.77z"
            fill="currentColor"></path>
        </svg>
        <RiSubwayFill class="size-4.5" />
        <RiEarthFill class="size-4.5" />
      </div>
    </div>
    <!-- 右下角按钮组 -->
    <div class="fixed bottom-8 right-8 z-9999 flex flex-col gap-3 items-end">
      <!-- 返回顶部/进度按钮 -->
      <Transition name="fade">
        <button
          v-if="showProgress || showBackToTop"
          @click="scrollToTop"
          class="cursor-pointer relative rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 aspect-square size-7.5 hover:border-blue-700"
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
              <RiArrowUpLine class="size-4 fill-gray-600 dark:fill-gray-300" />
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

      <!-- 暗黑模式切换按钮 -->
      <button
        @click="handleClick"
        class="cursor-pointer rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 transition-all duration-300 size-7.5 hover:border-blue-700"
        :title="colorMode.value === 'dark' ? '切换到亮色模式' : '切换到暗色模式'">
        <RiSunLine v-if="colorMode.value !== 'dark'" class="size-4 fill-gray-600" />
        <RiMoonLine v-else class="size-4 fill-gray-100" />
      </button>

      <!-- 页脚音乐播放器 -->
      <FooterMusic />
    </div>
  </div>
</template>

<style scoped>
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
