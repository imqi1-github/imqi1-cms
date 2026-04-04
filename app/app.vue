<script setup lang="ts">
const route = useRoute();

// 判断是否是前台页面（非后台）
const isFrontend = computed(() => !route.path.startsWith("/admin") && route.path !== "/login");
</script>

<template>
  <div>
    <!-- 前台布局：Header 和 Footer 不刷新 -->
    <template v-if="isFrontend">
      <div class="min-h-screen flex flex-col">
        <SiteHeader class="font-serif font-[450]" />
        <main class="bg-white pt-20 px-5 pb-10 grow">
          <NuxtPage class="font-serif font-[450]" />
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
