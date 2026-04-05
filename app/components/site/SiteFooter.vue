<script setup lang="ts">
import {
  RiCopyrightLine,
  RiCreativeCommonsByLine,
  RiCreativeCommonsNcLine,
  RiCreativeCommonsNdLine,
  RiEarthFill,
  RiRssFill,
  RiSubwayFill, RiSunLine,
} from "@remixicon/vue";

const currentYear = new Date().getFullYear();

// 获取站点设置
const { data } = await useFetch("/api/site");
const siteName = computed(() => data.value?.data?.siteName || "ImQi1");
const siteIcp = computed(() => data.value?.data?.siteIcp || "");
</script>

<template>
  <div class="bg-slate-50">
    <div class="flex items-center justify-between p-5 max-w-175 w-full mx-auto font-semibold text-slate-600">
      <div class="flex items-center gap-2">
        <span>{{ currentYear }} &copy; {{ siteName }}</span>
        <span v-if="siteIcp">│ {{ siteIcp }}</span>
      </div>
      <div class="**:fill-slate-600 flex gap-2 items-center">
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
    <div class="footer-buttons fixed bottom-8 right-8">
      <button class="footer-button rounded-full border border-px border-gray-200 p-1.5 flex items-center justify-center bg-white">
        <RiSunLine class="size-4 fill-gray-600" />
      </button>
    </div>
  </div>
</template>

<style scoped></style>
