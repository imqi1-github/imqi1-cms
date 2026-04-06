<script setup lang="ts">
import {RiHomeLine} from "@remixicon/vue";

const route = useRoute();

// 获取站点设置
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");

// 获取分类
const { data: categoriesData } = await useFetch("/api/categories");
const categories = computed(() => categoriesData.value?.data || []);

// 导航项数据
const navItems = [
  { name: "留言", href: "/message", icon: "ri:chat-1-line" },
  { name: "友链", href: "/link", icon: "ri:links-line" },
  { name: "关于", href: "/about", icon: "ri:user-line" },
];

// 是否显示分类下拉菜单
const showCategory = ref(false);

// 滚动监听
const isScrolled = ref(false);

onMounted(() => {
  const handleScroll = () => {
    isScrolled.value = window.scrollY > 20;
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  onUnmounted(() => {
    window.removeEventListener("scroll", handleScroll);
  });
});
</script>

<template>
  <nav class="sticky top-5 z-50 h-0 transition-all duration-150" :class="{ sticked: isScrolled }" aria-label="主导航">
    <div class="flex justify-between items-center max-w-225 mx-auto relative">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex items-center gap-1 px-4 py-2 rounded-full relative overflow-hidden transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)] group"
        :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
        <img src="/imgs/imqi1.svg" alt="favicon" class="w-5.5 h-5.5" />
        <span class="text-[0.95em] font-black -top-px relative">{{ siteName }}</span>
        <div class="absolute inset-0 items-center group-hover:opacity-100 opacity-0 transition-all duration-150 justify-center flex bg-blue-600">
          <RiHomeLine class="size-5 fill-white" />
        </div>
      </NuxtLink>

      <!-- 右侧菜单 -->
      <div
        id="nav-menu"
        class="flex items-center gap-2.5 px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl bg-white/0 dark:bg-gray-900/0 shadow-[0_5px_20px_-5px_hsla(0,16%,87%,0)]"
        :class="isScrolled ? 'bg-white/75 dark:bg-gray-900/75 shadow-xs' : ''">
        <!-- 搜索按钮 -->
        <div class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white">
          <Icon name="ri:search-line" class="text-[1.2em] relative z-1" />
          <span
            class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-0" />
        </div>

        <!-- 分类下拉 -->
        <div
          class="relative"
          @mouseenter="showCategory = true"
          @mouseleave="showCategory = false">
          <div class="group flex items-center justify-center w-6.25 h-6.25 rounded-full cursor-pointer relative hover:text-white">
            <Icon name="ri:book-shelf-line" class="text-[1.2em] relative z-1" />
            <span
              class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-0" />
          </div>

          <!-- 分类下拉菜单 -->
          <div
            class="absolute right-0 top-full mt-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 py-1 px-2 min-w-28 opacity-0 invisible transition-all duration-200 translate-y-2"
            :class="{ 'opacity-100 visible translate-y-0': showCategory }">
            <NuxtLink
              v-for="cat in categories"
              :key="cat.slug"
              :to="`/category/${cat.slug}`"
              class="block px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-150 no-underline text-sm font-medium"
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
            class="absolute -inset-0.5 bg-blue-600 rounded-full opacity-0 scale-0 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-0" />
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}
</style>
