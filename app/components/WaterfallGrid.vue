<script setup lang="ts">
import LivePhoto from "./LivePhoto.vue";

import type {Props, WaterfallItem} from "~/types/components/waterfall";

const props = withDefaults(defineProps<Props>(), {
  asLink: true,
  lazy: true,
  items: () => [] as WaterfallItem[],
});

const getLinkUrl = (item: WaterfallItem) => {
  if (!props.asLink) return undefined;
  const category = item.categorySlug || "uncategorized";
  const slug = item.slug || item.cid?.toString() || "";
  return `/content/${category}/${slug}`;
};

const getAltText = (item: WaterfallItem) => {
  return item.desc && item.desc.trim()
    ? `${item.desc} - ${item.title}`
    : item.title;
};

const getAspectRatio = (item: WaterfallItem) => {
  if (!item.width || !item.height) return undefined;
  return `${item.width} / ${item.height}`;
};
</script>

<template>
  <!-- 外层：columns 容器 -->
  <div
    class="w-full columns-1 min-[465px]:columns-2 md:columns-3 lg:columns-4 gap-1.5"
  >
    <template v-for="(item, index) in items" :key="index">
      <!-- 链接模式 -->
      <NuxtLink
        v-if="asLink"
        :to="getLinkUrl(item)"
        :aria-label="`查看图片：${getAltText(item)}`"
        class="block mb-1.5 break-inside-avoid group waterfall-item"
      >
        <div
          class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-sm transition-all duration-300"
          :style="{ aspectRatio: getAspectRatio(item) }"
        >
          <LivePhoto
            :src="item.url"
            :alt="getAltText(item)"
            :aspect-ratio="getAspectRatio(item)"
            :show-placeholder="false"
            class="w-full h-full object-cover"
            :lazy="props.lazy"
          />

          <div
            class="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          >
            <div class="absolute bottom-0 left-0 right-0 px-2 py-1">
              <p class="text-white text-xs text-center font-medium line-clamp-2">
                {{ getAltText(item) }}
              </p>
            </div>
          </div>
        </div>
      </NuxtLink>

      <!-- 非链接模式 -->
      <div v-else class="block mb-1.5 break-inside-avoid group waterfall-item">
        <div
          class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-sm transition-all duration-300"
          :style="{ aspectRatio: getAspectRatio(item) }"
        >
          <LivePhoto
            :src="item.url"
            :alt="getAltText(item)"
            :aspect-ratio="getAspectRatio(item)"
            :show-placeholder="false"
            class="w-full h-full object-cover"
            :lazy="props.lazy"
          />

          <div
            class="absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          >
            <div class="absolute bottom-0 left-0 right-0 px-2 py-1">
              <p class="text-white text-xs text-center font-medium line-clamp-2">
                {{ getAltText(item) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 隔离每个瀑布流项的布局与绘制：
   淡入期间单张图片的解码/回流不会连带重绘相邻项，降低主线程逐帧开销 */
.waterfall-item {
  contain: layout paint;
}
</style>