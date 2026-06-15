<script setup lang="ts">
import { Menu } from "lucide-vue-next";
import { siteConfig } from "~~/site.config";

const router = useRouter();
const props = defineProps({
  siteName: {
    type: String,
    default: "默认站点",
  },
});

// 移动端侧边栏开关
const isMobileMenuOpen = ref(false);

// 获取分类 - 使用非阻塞加载，不阻塞首屏渲染
const { data: categoriesData } = useLazyAsyncData("nav-categories", () => $fetch<{ data: Array<{ name: string; slug: string | null }> }>("/api/categories", {
  headers: {
    "x-ssr-internal-request": "true",
  },
}), {
  server: true,
});
const categories = computed(() => categoriesData.value?.data || []);

// 导航项数据
const navItems = [
  { name: "留言", href: "/messages", icon: "ri:chat-1-line" },
  { name: "友链", href: "/links", icon: "ri:links-line" },
  { name: "关于", href: "/about", icon: "ri:user-line" },
];

// 滚动监听
const isScrolled = ref(false);

// 导航函数
function navigate(href: string, event?: MouseEvent) {
  // 点击后立即失焦，避免 :focus-within 让下拉菜单保持展开
  if (event?.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
  router.push(href);
}

// 关闭移动端菜单
function closeMobileMenu() {
  isMobileMenuOpen.value = false;
}

// 跳转并关闭菜单
function navigateAndClose(href: string) {
  navigate(href);
  closeMobileMenu();
}

onMounted(() => {
  const handleScroll = () => {
    const currentScrollY = window.scrollY;
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
  <div
    key="site-nav-menu"
    class="flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)] ml-auto mr-3"
    :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
    <!-- PC端菜单项 -->
    <div key="pc-nav-items" class="hidden md:flex items-center gap-2.5">
      <!-- 搜索按钮 -->
      <div
        key="search-button"
        role="button"
        tabindex="0"
        aria-label="搜索"
        class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white"
        @click="navigate('/search')"
        @keydown.enter="navigate('/search')"
        @keydown.space.prevent="navigate('/search')"
        v-tooltip="`搜索`">
        <Icon name="ri:search-line" aria-hidden="true" class="text-[1.2em] relative z-1" />
        <span aria-hidden="true"
          class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
      </div>

      <!-- 分类下拉 -->
      <div key="category-dropdown" class="group/dropdown relative">
        <div
          role="button"
          tabindex="0"
          aria-label="分类"
          aria-haspopup="true"
          class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white">
          <Icon name="ri:book-shelf-line" aria-hidden="true" class="text-[1.2em] relative z-1" />
          <span aria-hidden="true"
            class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
        </div>

        <!-- 分类下拉菜单 -->
        <div
          role="menu"
          aria-label="分类"
          class="absolute right-0 top-full mt-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 py-1 px-2 min-w-28 opacity-0 invisible group-hover/dropdown:opacity-100 group-hover/dropdown:visible group-focus-within/dropdown:opacity-100 group-focus-within/dropdown:visible transition-all duration-200 before:left-0 before:right-0 before:-top-5 before:h-5 before:absolute">
          <button
            v-for="cat in categories"
            :key="cat.slug ?? cat.name"
            role="menuitem"
            @click="navigate(`/category/${cat.slug}`, $event)"
            class="block w-full text-left px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 text-sm font-medium cursor-pointer font-serif">
            {{ cat.name }}
          </button>
        </div>
      </div>

      <!-- 其他导航项 -->
      <div
        v-for="item in navItems"
        :key="item.href"
        role="button"
        tabindex="0"
        :aria-label="item.name"
        @click="navigate(item.href)"
        @keydown.enter="navigate(item.href)"
        @keydown.space.prevent="navigate(item.href)"
        v-tooltip="item.name"
        class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative text-inherit hover:text-white">
        <Icon :name="item.icon" aria-hidden="true" class="text-[1.2em] relative z-1" />
        <span aria-hidden="true"
          class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100 z-0" />
      </div>
    </div>

    <!-- 移动端汉堡菜单按钮 -->

    <NuxtLink to="/" class="text-inherit font-serif font-bold flex items-center justify-center gap-1 md:hidden">
      <img :src="siteConfig.seo.ogImage" alt="favicon" class="w-5.5 h-5.5" />
      <div class="text-[0.95em] font-black -top-px relative">{{ siteName }}</div>
    </NuxtLink>

    <button
      @click="isMobileMenuOpen = true"
      class="md:hidden flex items-center justify-center rounded-full transition-all duration-300 hover:bg-white/50 dark:hover:bg-gray-800/50"
      aria-label="打开菜单"
      :aria-expanded="isMobileMenuOpen"
      aria-controls="mobile-menu">
      <Menu aria-hidden="true" class="size-4" />
    </button>
  </div>

  <!-- 移动端侧边栏菜单 -->
  <Sheet :open="isMobileMenuOpen" @update:open="isMobileMenuOpen = $event">
    <SheetContent id="mobile-menu" side="right" class="w-80 font-serif font-[450]">
      <SheetHeader>
        <SheetTitle>菜单</SheetTitle>
        <SheetDescription class="sr-only"> 网站导航菜单，包含搜索、分类和其他页面链接 </SheetDescription>
      </SheetHeader>

      <nav class="flex flex-col gap-2 mt-6" aria-label="移动端导航">
        <!-- 搜索 -->
        <button
          @click="navigateAndClose('/search')"
          class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left">
          <Icon name="ri:search-line" aria-hidden="true" class="size-5" />
          <span class="font-medium">搜索</span>
        </button>

        <!-- 分类列表 -->
        <div v-if="categories.length > 0" class="space-y-1">
          <div class="px-4 py-2 text-sm font-medium text-muted-foreground">分类</div>
          <button
            v-for="cat in categories"
            :key="cat.slug ?? cat.name"
            @click="navigateAndClose(`/category/${cat.slug}`)"
            class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left">
            <Icon name="ri:book-shelf-line" aria-hidden="true" class="size-5" />
            <span class="font-medium">{{ cat.name }}</span>
          </button>
        </div>

        <Separator class="my-2" />

        <!-- 其他导航项 -->
        <button
          v-for="item in navItems"
          :key="item.href"
          @click="navigateAndClose(item.href)"
          class="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors w-full text-left">
          <Icon :name="item.icon" aria-hidden="true" class="size-5" />
          <span class="font-medium">{{ item.name }}</span>
        </button>
      </nav>
    </SheetContent>
  </Sheet>
</template>
