<script setup lang="ts">
import {
  RiCopyrightLine,
  RiCreativeCommonsByLine,
  RiCreativeCommonsNcLine,
  RiCreativeCommonsNdLine,
  RiEarthFill,
  RiRssFill,
  RiSubwayFill,
  RiSunLine,
  RiMoonLine,
} from "@remixicon/vue";

const currentYear = new Date().getFullYear();

// 获取站点设置
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");
const siteIcp = computed(() => data.value?.data?.siteIcp || "");

// 使用官方 colorMode 模块
const colorMode = useColorMode();

// 测试函数
const handleClick = () => {
  console.log("Button clicked!");
  console.log("colorMode.value:", colorMode.value);
  console.log("colorMode.preference:", colorMode.preference);
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  console.log("New preference:", colorMode.preference);
};
</script>

<template>
  <div class="bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
    <div class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600 dark:text-slate-400">
      <div class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span v-if="siteIcp">│ {{ siteIcp }}</span>
      </div>
      <div class="**:fill-slate-600 dark:**:fill-slate-400 flex gap-2 items-center">
        <RiRssFill class="size-4.5" />
        <div class="flex items-center **:size-4.5 **:fill-state-600">
          <RiCopyrightLine />
          <RiCreativeCommonsByLine />
          <RiCreativeCommonsNcLine />
          <RiCreativeCommonsNdLine />
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="icon"
          viewBox="0 0 1024 1024"
          width="16"
          height="16">
          <path
            d="M512 1024C132.647 1024 0 891.313 0 512S132.647 0 512 0s512 132.687 512 512-132.647 512-512 512zM236.308 354.462h551.384v-78.77H236.308v78.77z m0 196.923h393.846v-78.77H236.308v78.77z m0 196.923h472.615v-78.77H236.308v78.77z"
            fill="currentColor"></path>
        </svg>
        <RiSubwayFill class="size-4.5" />
        <RiEarthFill class="size-4.5" />
      </div>
    </div>
    <!-- 暗黑模式切换按钮 -->
    <button
      @click="handleClick"
      class="cursor-pointer fixed bottom-8 right-8 z-[9999] rounded-full border border-gray-200 dark:border-gray-700 p-1.5 flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all duration-300 shadow-sm hover:shadow-md"
      :title="colorMode.value === 'dark' ? '切换到亮色模式' : '切换到暗色模式'">
      <RiSunLine v-if="colorMode.value !== 'dark'" class="size-4 fill-gray-600" />
      <RiMoonLine v-else class="size-4 fill-gray-100" />
    </button>
  </div>
</template>

<style scoped></style>
