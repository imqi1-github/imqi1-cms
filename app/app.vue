<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();

// 应用滚动条主题
useScrollbarTheme();

// 判断是否是前台页面（非后台）
const isFrontend = computed(() => !route.path.startsWith("/admin") && route.path !== "/login");

// 页面加载状态
const showPageLoading = ref(false);

// 监听路由变化开始加载
watch(() => route.path, () => {
  showPageLoading.value = true;
});

// 监听页面加载完成
const nuxtApp = useNuxtApp();
nuxtApp.hook("page:finish", () => {
  showPageLoading.value = false;
});

// 提供给子组件
provide("pageLoading", readonly(showPageLoading));

// 获取字体 CSS URL
const fontCssUrl = computed(() => {
  const cdnURL = config.public.cdnURL as string;
  // 生产环境且配置了 CDN 时使用 CDN，否则使用本地路径
  return import.meta.env.PROD && cdnURL ? `${cdnURL}/fonts/font.css` : "/fonts/font.css";
});

// 全局 RSS 订阅链接和字体
useHead({
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
        behavior: "smooth"
      });
    }
  });
}

// 监听路由变化，处理 Hash 滚动
watch(() => route.hash, () => {
  scrollToHash();
}, { immediate: true });
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

    <Toaster />
  </div>
</template>
