<script setup lang="ts">
const route = useRoute();

// 获取站点设置
const { data } = await useFetch('/api/site');
const siteName = computed(() => data.value?.data?.siteName || 'ImQi1');

const navItems = [
  { name: '首页', path: '/' },
  { name: '订阅', path: '/subscribes' },
];

const isCurrentPath = (path: string) => {
  return route.path === path;
};
</script>

<template>
  <header class="bg-white border-b border-gray-200 sticky top-0 z-100">
    <div class="max-w-6xl mx-auto px-5 h-16 flex items-center gap-10">
      <!-- Logo -->
      <a href="/" class="no-underline">
        <span class="text-2xl font-bold text-gray-800 tracking-tight">{{ siteName }}</span>
      </a>

      <!-- Navigation -->
      <nav class="flex gap-2 flex-1">
        <a
          v-for="item in navItems"
          :key="item.path"
          :href="item.path"
          class="px-4 py-2 rounded-md text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all no-underline"
          :class="{ 'text-blue-500 bg-blue-50': isCurrentPath(item.path) }"
        >
          {{ item.name }}
        </a>
      </nav>

      <!-- Search -->
      <div class="relative w-60">
        <input
          type="search"
          placeholder="搜索..."
          class="w-full py-2 pr-9 pl-3 border border-gray-200 rounded-full text-sm outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 transition-all"
        />
        <Icon name="lucide:search" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.no-underline {
  text-decoration: none;
}
</style>
