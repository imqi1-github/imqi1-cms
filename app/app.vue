<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();
const router = useRouter();

// 应用滚动条主题
useScrollbarTheme();

// 判断是否是前台页面（非后台）
const isFrontend = computed(() => !route.path.startsWith("/admin") && route.path !== "/login");

// 页面加载状态
const showPageLoading = ref(false);
const showLoadingTimeout = ref(false);
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let loadingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

// 监听页面开始加载（更早的钩子，在路由导航一开始就触发）
const nuxtApp = useNuxtApp();
nuxtApp.hook("page:start", () => {
  // 清除之前的隐藏定时器
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  // 清除之前的加载超时定时器
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }

  // 重置状态
  showPageLoading.value = true;
  showLoadingTimeout.value = false;

  // 设置定时器，1秒后显示加载提示
  loadingTimeoutTimer = setTimeout(() => {
    showLoadingTimeout.value = true;
  }, 100);
});

// 监听页面加载完成
nuxtApp.hook("page:finish", () => {
  // 清除加载超时定时器
  if (loadingTimeoutTimer) {
    clearTimeout(loadingTimeoutTimer);
    loadingTimeoutTimer = null;
  }

  // 重置状态
  showLoadingTimeout.value = false;

  // 重置页面内容的样式，确保新页面能正确显示
  const mainContent = document.querySelector("main");
  if (mainContent) {
    mainContent.style.transition = "";
    mainContent.style.opacity = "";
    mainContent.style.transform = "";
  }

  // 重置 index-hero 元素的样式
  const heroElement = document.querySelector(".index-hero");
  if (heroElement) {
    heroElement.style.transition = "";
    heroElement.style.opacity = "";
    heroElement.style.transform = "";
  }

  // 设置最小显示时间为 500ms，确保用户能看到加载动画
  showPageLoading.value = false;
});

// 路由导航守卫，添加渐出效果
router.beforeEach(async (to, from) => {
  // 只有前台页面需要渐出效果
  if (isFrontend.value && from.path !== to.path) {
    // 获取当前页面的主要内容元素
    const mainContent = document.querySelector("main");
    if (mainContent) {
      // 添加渐出效果
      mainContent.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      mainContent.style.opacity = "0";
      // mainContent.style.transform = "translateY(20px)";
    }

    // 处理 fixed 定位的 index-hero 元素
    // const heroElement = document.querySelector(".index-hero");
    // if (heroElement) {
    // 添加渐出效果，使用更具体的样式
    // heroElement.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    // heroElement.style.opacity = "0";
    // heroElement.style.transform = "scale(0.9)";
    // heroElement.style.pointerEvents = "none";
  }

  // 等待渐出效果完成，延长时间确保效果可见
  // await new Promise(resolve => setTimeout(resolve, 300000));
  // }
  // 直接返回，不需要调用next()
  return true;
});

// 提供给子组件
provide("pageLoading", readonly(showPageLoading));

// 获取字体 CSS URL
const fontCssUrl = computed(() => {
  const cdnURL = config.public.cdnURL as string;
  // 生产环境且配置了 CDN 时使用 CDN，否则使用本地路径
  return import.meta.env.PROD && cdnURL ? `${cdnURL}/fonts/font.css` : "/fonts/font.css";
});

// 全局 SEO 元信息
const siteUrl = "https://imqi1.qi1.website";
const siteDescription = "做技术的分享者、生活的摄影师、时事的评论员。";
const siteKeywords = "技术,摄影,时事,博客,编程,开发,Vue,Nuxt,JavaScript";

// Favicon 路径（根据 CDN 配置动态生成）
const faviconUrl = computed(() => {
  const cdnURL = config.public.cdnURL as string;
  return import.meta.env.PROD && cdnURL ? `${cdnURL}/favicon.ico` : "/favicon.ico";
});

// Apple Touch Icon 路径
const appleTouchIconUrl = computed(() => {
  const cdnURL = config.public.cdnURL as string;
  return import.meta.env.PROD && cdnURL ? `${cdnURL}/imgs/imqi1-144.png` : "/imgs/imqi1-144.png";
});

// PWA Manifest 路径（根据 CDN 配置动态生成）
const manifestUrl = computed(() => {
  const cdnURL = config.public.cdnURL as string;
  return import.meta.env.PROD && cdnURL ? `${cdnURL}/manifest.webmanifest` : "/manifest.webmanifest";
});

useHead({
  htmlAttrs: {
    lang: "zh-CN",
  },
  link: [
    {
      rel: "alternate",
      type: "application/rss+xml",
      title: "RSS 订阅",
      href: "/feed",
    },
    {
      rel: "stylesheet",
      href: fontCssUrl.value,
    },
    {
      rel: "canonical",
      href: computed(() => {
        if (process.client) {
          return window.location.href;
        }
        return siteUrl + route.path;
      }),
    },
    // PWA Manifest
    {
      rel: "manifest",
      href: manifestUrl,
    },
    // Favicon
    {
      rel: "icon",
      type: "image/x-icon",
      href: faviconUrl,
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: appleTouchIconUrl,
    },
  ],
  meta: [
    // 基础元信息
    {
      name: "description",
      content: siteDescription,
    },
    {
      name: "keywords",
      content: siteKeywords,
    },
    {
      name: "author",
      content: "ImQi1",
    },

    // Open Graph
    {
      property: "og:site_name",
      content: "ImQi1",
    },
    {
      property: "og:title",
      content: "ImQi1 - 做技术的分享者、生活的摄影师、时事的评论员",
    },
    {
      property: "og:description",
      content: siteDescription,
    },
    {
      property: "og:image",
      content: `${siteUrl}/imgs/og-image.png`,
    },
    {
      property: "og:url",
      content: computed(() => {
        if (process.client) {
          return window.location.href;
        }
        return siteUrl + route.path;
      }),
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      property: "og:locale",
      content: "zh_CN",
    },

    // Twitter Card
    {
      name: "twitter:card",
      content: "summary_large_image",
    },
    {
      name: "twitter:title",
      content: "ImQi1 - 做技术的分享者、生活的摄影师、时事的评论员",
    },
    {
      name: "twitter:description",
      content: siteDescription,
    },
    {
      name: "twitter:image",
      content: `${siteUrl}/imgs/og-image.png`,
    },
    {
      name: "twitter:site",
      content: "@imqi1",
    },

    // 其他
    {
      name: "theme-color",
      content: "#f9fafb",
    },
    {
      name: "mobile-web-app-capable",
      content: "yes",
    },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "default",
    },
    {
      name: "robots",
      content: "index, follow",
    },
    {
      name: "googlebot",
      content: "index, follow",
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
  console.log(
    "%c ImQi1\u6B22\u8FCE\u4F60\u7684\u6765\u8BBF\u3002",
    "background: linear-gradient(270deg,#f9fafb,#eaecf0,#dddddd);padding:8px 15px;border-radius:8px;color:#222",
  );
  console.log(
    "██╗███╗   ███╗ ██████╗ ██╗ ██╗    ██████╗ ██████╗ ███╗   ███╗\n" +
      "██║████╗ ████║██╔═══██╗██║███║   ██╔════╝██╔═══██╗████╗ ████║\n" +
      "██║██╔████╔██║██║   ██║██║╚██║   ██║     ██║   ██║██╔████╔██║\n" +
      "██║██║╚██╔╝██║██║▄▄ ██║██║ ██║   ██║     ██║   ██║██║╚██╔╝██║\n" +
      "██║██║ ╚═╝ ██║╚██████╔╝██║ ██║██╗╚██████╗╚██████╔╝██║ ╚═╝ ██║\n" +
      "╚═╝╚═╝     ╚═╝ ╚══▀▀═╝ ╚═╝ ╚═╝╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝",
  );
});
</script>

<template>
  <div>
    <!-- 前台布局：Header 和 Footer 不刷新 -->
    <template v-if="isFrontend">
      <div class="min-h-screen flex flex-col">
        <SiteHeader />
        <main class="bg-white dark:bg-slate-950 flex pt-20 px-5 pb-10 grow">
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
    <div v-if="showLoadingTimeout" class="fixed inset-0 flex items-center justify-center">
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
    <ContextMenu class="right-button" />
    <FrontNotification />
  </div>
</template>
