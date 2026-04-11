<script setup lang="ts">
import { Menu } from "lucide-vue-next";

const route = useRoute();
const router = useRouter();

// 移动端侧边栏开关
const isMobileMenuOpen = ref(false);

// 获取站点设置 - 使用非阻塞加载，不阻塞首屏渲染
const { data } = useLazyAsyncData("site-settings", () => $fetch("/api/site"), {
  server: true,
});
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");

// 获取分类 - 使用非阻塞加载，不阻塞首屏渲染
const { data: categoriesData } = useLazyAsyncData("categories", () => $fetch("/api/categories"), {
  server: true,
});
const categories = computed(() => categoriesData.value?.data || []);

// 获取页面标题（从页面组件设置）
const { getPageTitle, getPageIcon } = usePageTitle();
const pageTitle = computed(() => getPageTitle().value || null);
const pageIcon = computed(() => getPageIcon().value || null);

// 面包屑数据
interface BreadcrumbItem {
  name: string;
  icon?: string;
  href?: string;
  isCurrent?: boolean;
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const path = route.path;
  const items: BreadcrumbItem[] = [];

  // 首页
  if (path === "/") {
    items.push({
      name: siteName.value,
      icon: "ri:home-line",
      isCurrent: true,
    });
    return items;
  }

  // 添加首页
  items.push({
    name: "",
    icon: "ri:home-line",
    href: "/",
  });

  // 文章页
  if (path.startsWith("/content/")) {
    items.push({
      name: pageTitle.value || "文章",
      icon: pageIcon.value || "ri:file-edit-line",
      isCurrent: true,
    });
  }
  // 独立页面
  else if (path.startsWith("/pages/")) {
    items.push({
      name: route.meta.title || "页面",
      icon: "ri:file-3-line",
      isCurrent: true,
    });
  }
  // 分类页
  else if (path.startsWith("/category/")) {
    items.push({
      name: pageTitle.value || "分类",
      icon: pageIcon.value || "ri:menu-line",
      isCurrent: true,
    });
  }
  // 标签页
  else if (path.startsWith("/tag/")) {
    items.push({
      name: route.meta.title || "标签",
      icon: "ri:hashtag",
      isCurrent: true,
    });
  }
  // 搜索页
  else if (path.startsWith("/search")) {
    items.push({
      name: "搜索",
      icon: "ri:search-line",
      isCurrent: true,
    });
  }
  // 留言页
  else if (path === "/message") {
    items.push({
      name: "留言",
      icon: "ri:chat-1-line",
      isCurrent: true,
    });
  }
  // 友链页
  else if (path === "/links") {
    items.push({
      name: "友链",
      icon: "ri:links-line",
      isCurrent: true,
    });
  }
  // 关于页
  else if (path === "/about") {
    items.push({
      name: "关于",
      icon: "ri:user-line",
      isCurrent: true,
    });
  }
  // 协议页
  else if (path === "/agreement") {
    items.push({
      name: "协议",
      icon: "ri:file-text-line",
      isCurrent: true,
    });
  }
  // 404或其他
  else {
    items.push({
      name: "页面未找到",
      icon: "ri:close-large-fill",
      isCurrent: true,
    });
  }

  return items;
});

// 获取当前页标题（用于向下滚动时显示）
const currentPageTitle = computed(() => {
  const lastItem = breadcrumbs.value[breadcrumbs.value.length - 1];
  const pageName = lastItem?.name || "";

  // 如果是主页，显示"站点名称 - 记录生活，分享技术"
  if (route.path === "/") {
    return `${siteName.value} - 记录生活，分享技术`;
  }

  // 其他页面显示"页名称 - 站点名称"
  return pageName ? `${pageName} - ${siteName.value}` : siteName.value;
});

// 导航项数据
const navItems = [
  { name: "留言", href: "/message", icon: "ri:chat-1-line" },
  { name: "友链", href: "/links", icon: "ri:links-line" },
  { name: "关于", href: "/about", icon: "ri:user-line" },
];

// 滚动监听
const isScrolled = ref(false);
// 滚动方向：true=向下，false=向上（默认为true，让页面加载时显示标题）
const isScrollingDown = ref(true);
// 上次滚动位置
let lastScrollY = 0;

// 监听路由变化，重置滚动方向状态
const isRouteChanging = ref(false);
const isInitialLoad = ref(false);
let shouldIgnoreScroll = false;

watch(
  () => route.path,
  () => {
    // 标记路由正在切换和初始加载，忽略滚动事件
    isRouteChanging.value = true;
    isInitialLoad.value = true;
    shouldIgnoreScroll = true;

    // 重置状态
    isScrollingDown.value = true;
    lastScrollY = 0;
    isScrolled.value = false;

    // 延迟恢复状态，确保没有动画
    setTimeout(() => {
      isRouteChanging.value = false;
    }, 50);

    // 初始加载状态持续更长时间，然后恢复滚动监听
    setTimeout(() => {
      isInitialLoad.value = false;
      shouldIgnoreScroll = false;
    }, 500);
  },
);

// 跳转到搜索页面
function goToSearch() {
  router.push("/search");
}

// 关闭移动端菜单
function closeMobileMenu() {
  isMobileMenuOpen.value = false;
}

// 跳转并关闭菜单
function navigateAndClose(href: string) {
  router.push(href);
  closeMobileMenu();
}

onMounted(() => {
  const handleScroll = () => {
    // 如果正在路由切换，忽略滚动事件
    if (shouldIgnoreScroll) return;

    const currentScrollY = window.scrollY;

    // 检测滚动方向
    if (currentScrollY > lastScrollY) {
      isScrollingDown.value = true;
    } else if (currentScrollY < lastScrollY) {
      isScrollingDown.value = false;
    }

    lastScrollY = currentScrollY;
    isScrolled.value = currentScrollY > 20;
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  onUnmounted(() => {
    window.removeEventListener("scroll", handleScroll);
  });
});
</script>

<template>
  <nav class="sticky top-5 z-50 h-0 transition-all duration-300 max-md:top-4 max-md:right-2" :class="{ sticked: isScrolled }" aria-label="主导航">
    <div class="flex justify-between items-center max-w-225 mx-auto relative">
      <!-- 左侧Logo - PC端显示 -->
      <NuxtLink
        to="/"
        class="hidden md:flex items-center gap-1 px-4 py-2 rounded-full relative overflow-hidden transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)] group font-serif font-[450]"
        :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
        <img src="/imgs/imqi1.svg" alt="favicon" class="w-5.5 h-5.5" />
        <span class="text-[0.95em] font-black -top-px relative">{{ siteName }}</span>
        <div class="absolute inset-0 items-center group-hover:opacity-100 opacity-0 transition-all duration-300 justify-center flex bg-blue-600">
          <Icon name="ri:home-fill" class="size-5 text-white" mode="svg" />
        </div>
      </NuxtLink>

      <!-- 中间面包屑胶囊 - PC端显示 -->
      <div class="absolute left-1/2 top-0.5 -translate-x-1/2 -translate-y-1/2 hidden md:flex font-serif font-[450]">
        <ClientOnly>
          <!-- 首页：固定显示标题 -->
          <div
            v-if="route.path === '/'"
            class="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/75 dark:bg-gray-900/75 w-max"
            :class="isScrolled ? 'shadow-xs' : ''">
            <div class="flex items-center gap-1 font-medium text-sm">
              <span>{{ currentPageTitle }}</span>
            </div>
          </div>

          <!-- 其他页面：滚动切换 -->
          <template v-else>
            <!-- 路由切换时或初始加载时：直接显示标题，无动画 -->
            <div
              v-if="isRouteChanging || isInitialLoad"
              class="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/75 dark:bg-gray-900/75 w-max">
              <div class="flex items-center gap-1 font-medium text-sm">
                <span>{{ currentPageTitle }}</span>
              </div>
            </div>

            <!-- 正常滚动时：有过渡动画 -->
            <Transition v-else :name="isScrollingDown ? 'breadcrumb-slide-up' : 'breadcrumb-slide-down'">
              <!-- 向下滚动时：显示当前页标题 -->
              <div
                v-if="isScrollingDown"
                key="title"
                class="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/75 dark:bg-gray-900/75 w-max"
                :class="isScrolled ? 'shadow-xs' : ''">
                <div class="flex items-center gap-1 font-medium text-sm">
                  <span>{{ currentPageTitle }}</span>
                </div>
              </div>

              <!-- 向上滚动时：显示完整面包屑 -->
              <div
                v-else
                key="breadcrumbs"
                class="absolute left-1/2 -translate-x-1/2 top-0 flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)] w-max"
                :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
                <div class="flex items-center gap-2 text-sm">
                  <template v-for="(item, index) in breadcrumbs" :key="index">
                    <template v-if="index > 0">
                      <span class="text-muted-foreground">/</span>
                    </template>
                    <NuxtLink
                      v-if="item.href && !item.isCurrent"
                      :to="item.href"
                      class="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors no-underline">
                      <Icon v-if="item.icon" :name="item.icon" class="size-4" />
                      <span v-if="item.name" class="hidden sm:inline">{{ item.name }}</span>
                    </NuxtLink>
                    <span v-else class="flex items-center gap-1 font-medium">
                      <Icon v-if="item.icon" :name="item.icon" class="size-4" />
                      <span>{{ item.name }}</span>
                    </span>
                  </template>
                </div>
              </div>
            </Transition>
          </template>
        </ClientOnly>
      </div>

      <!-- 右侧胶囊菜单 -->
      <div
        class="flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)] ml-auto"
        :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
        <!-- 移动端Logo -->
        <NuxtLink
          to="/"
          class="md:hidden flex items-center gap-1 rounded-full relative overflow-hidden transition-all duration-300 font-serif font-[450]">
          <img src="/imgs/imqi1.svg" alt="favicon" class="w-5.5 h-5.5" />
          <span class="text-[0.95em] font-black -top-px relative">{{ siteName }}</span>
        </NuxtLink>

        <!-- PC端菜单项 -->
        <div class="hidden md:flex items-center gap-2.5">
          <!-- 搜索按钮 -->
          <div class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white" @click="goToSearch">
            <Icon name="ri:search-line" class="text-[1.2em] relative z-1" />
            <span
              class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
          </div>

          <!-- 分类下拉 -->
          <div class="group/dropdown relative">
            <div class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white">
              <Icon name="ri:book-shelf-line" class="text-[1.2em] relative z-1" />
              <span
                class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
            </div>

            <!-- 分类下拉菜单 -->
            <div
              class="absolute right-0 top-full mt-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 py-1 px-2 min-w-28 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible transition-all duration-200 before:left-0 before:right-0 before:-top-5 before:h-5 before:absolute">
              <NuxtLink
                v-for="cat in categories"
                :key="cat.slug"
                :to="`/category/${cat.slug}`"
                class="block px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 no-underline text-sm font-medium font-serif"
                :class="{ 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400': route.path === `/category/${cat.slug}` }">
                {{ cat.name }}
              </NuxtLink>
            </div>
          </div>

          <!-- 其他导航项 -->
          <NuxtLink
            v-for="item in navItems"
            :key="item.href"
            :to="item.href"
            class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative text-inherit hover:text-white no-underline">
            <Icon :name="item.icon" class="text-[1.2em] relative z-1" />
            <span
              class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
          </NuxtLink>
        </div>

        <!-- 移动端汉堡菜单按钮 -->
        <button
          @click="isMobileMenuOpen = true"
          class="md:hidden flex items-center justify-center rounded-full transition-all duration-300 hover:bg-white/50 dark:hover:bg-gray-800/50"
          aria-label="打开菜单">
          <Menu class="size-4" />
        </button>
      </div>
    </div>
  </nav>

  <!-- 移动端侧边栏菜单 -->
  <Sheet :open="isMobileMenuOpen" @update:open="isMobileMenuOpen = $event">
    <SheetContent side="right" class="w-80 font-serif font-[450]">
      <SheetHeader>
        <SheetTitle>菜单</SheetTitle>
        <SheetDescription class="sr-only"> 网站导航菜单，包含搜索、分类和其他页面链接 </SheetDescription>
      </SheetHeader>

      <div class="flex flex-col gap-2 mt-6">
        <!-- 搜索 -->
        <button
          @click="navigateAndClose('/search')"
          class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left">
          <Icon name="ri:search-line" class="size-5" />
          <span class="font-medium">搜索</span>
        </button>

        <!-- 分类列表 -->
        <div v-if="categories.length > 0" class="space-y-1">
          <div class="px-4 py-2 text-sm font-medium text-muted-foreground">分类</div>
          <button
            v-for="cat in categories"
            :key="cat.slug"
            @click="navigateAndClose(`/category/${cat.slug}`)"
            class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left"
            :class="{ 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400': route.path === `/category/${cat.slug}` }">
            <Icon name="ri:book-shelf-line" class="size-5" />
            <span class="font-medium">{{ cat.name }}</span>
          </button>
        </div>

        <Separator class="my-2" />

        <!-- 其他导航项 -->
        <button
          v-for="item in navItems"
          :key="item.href"
          @click="navigateAndClose(item.href)"
          class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left"
          :class="{ 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400': route.path === item.href }">
          <Icon :name="item.icon" class="size-5" />
          <span class="font-medium">{{ item.name }}</span>
        </button>
      </div>
    </SheetContent>
  </Sheet>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}

/* 向上滚动动画：面包屑显示 */
.breadcrumb-slide-down-enter-active,
.breadcrumb-slide-down-leave-active {
  transition:
    opacity 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

.breadcrumb-slide-down-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.breadcrumb-slide-down-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* 向下滚动动画：标题显示 */
.breadcrumb-slide-up-enter-active,
.breadcrumb-slide-up-leave-active {
  transition:
    opacity 0.2s ease-in-out,
    transform 0.2s ease-in-out;
}

.breadcrumb-slide-up-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.breadcrumb-slide-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
