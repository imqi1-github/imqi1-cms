<script setup lang="ts">
import LivePhoto from "./LivePhoto.vue";

import type {Props, WaterfallItem} from "~/types/components/waterfall";

const props = withDefaults(defineProps<Props>(), {
  asLink: true,
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
</script>

<template>
  <!-- 外层：columns 容器 -->
  <div
    class="w-full columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-1.5"
  >
    <template v-for="(item, index) in items" :key="index">
      <!-- 链接模式 -->
      <NuxtLink
        v-if="asLink"
        :to="getLinkUrl(item)"
        :aria-label="`查看图片：${getAltText(item)}`"
        class="block mb-1.5 break-inside-avoid group"
      >
        <div
          class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-sm transition-all duration-300"
        >
          <LivePhoto
            :src="item.url"
            :alt="getAltText(item)"
            class="w-full h-auto object-cover"
            :lazy="true"
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
      <div v-else class="block mb-1.5 break-inside-avoid group">
        <div
          class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-sm transition-all duration-300"
        >
          <LivePhoto
            :src="item.url"
            :alt="getAltText(item)"
            class="w-full h-auto object-cover"
            :lazy="true"
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