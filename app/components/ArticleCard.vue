<script setup lang="ts">
import type { ArticleCardContent } from "~/types/components/article-card";

defineProps<{
  content: ArticleCardContent;
  /** 内容链接里的分类 slug：分类页传当前分类 slug，标签页传 content.categorySlug || 'uncategorized' */
  linkSlug: string;
  /** 元信息行显示什么：'tags'=列标签（分类页），'category'=列所属分类（标签页） */
  metaMode: "tags" | "category";
}>();
</script>

<template>
  <div
    class="relative flex flex-col h-70 max-md:h-65 overflow-hidden rounded-[15px] shadow-sm hover:shadow-md border border-slate-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 group transition-all duration-300">
    <!-- 封面占满整卡 -->
    <NuxtLink
      v-if="content.covers.length > 0"
      :to="`/content/${linkSlug}/${content.slug}`"
      class="absolute inset-0">
      <img
        :src="content.covers[0]?.url"
        :alt="content.title"
        class="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
        loading="lazy" >
      <!-- 多封面角标 -->
      <div
        v-if="content.many_covers && content.covers.length > 1"
        class="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
        <Icon name="ri-gallery-line" class="size-3.5" />
        <span>+{{ content.covers.length - 1 }}</span>
      </div>
      <!-- 关联地点角标 -->
      <div
        v-if="content.travelCount > 0"
        :class="content.many_covers && content.covers.length > 1 ? 'top-10' : 'top-2'"
        class="absolute right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
        <Icon name="ri:map-pin-line" class="size-3.5" />
        <span>{{ content.travelCount }}</span>
      </div>
    </NuxtLink>

    <!-- 无封面占位 -->
    <div
      v-else
      class="flex-1 bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
      <span class="text-slate-400 dark:text-gray-500 text-6xl">{{ content.title[0] }}</span>
    </div>

    <!-- 文章信息（底部毛玻璃带） -->
    <div
      class="relative mt-auto w-full px-5 pb-2 pt-1.5"
      :class="content.covers.length > 0 ? 'cover-backdrop text-white' : 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md'">
      <NuxtLink
        :to="`/content/${linkSlug}/${content.slug}`"
        class="text-[1.5em] font-extrabold block transition-colors"
        :class="content.covers.length > 0 ? 'text-white hover:text-blue-100' : 'text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-500'">
        {{ content.title }}
      </NuxtLink>

      <div
        class="text-[0.8em] flex flex-wrap gap-2"
        :class="content.covers.length > 0 ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'">
        <span v-tooltip="`最后更新时间`" class="flex items-center">
          <Icon name="ri-time-line" class="size-4" />
          {{ formatDate(content.updated) }}
        </span>

        <!-- 分类页：列标签 -->
        <span v-if="metaMode === 'tags' && content.tags?.length" class="flex items-center flex-wrap">
          <Icon name="ri-hashtag" class="size-4" />
          <NuxtLink
            v-for="(tag, index) in content.tags"
            :key="index"
            v-tooltip="`标签`"
            :to="tag.slug ? `/tag/${tag.slug}` : '#'"
            class="mr-1 transition-colors"
            :class="[
              content.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400',
              tag.slug ? 'cursor-pointer' : 'cursor-default opacity-60',
            ]">
            {{ tag.name }}
          </NuxtLink>
        </span>

        <!-- 标签页：列所属分类 -->
        <span v-else-if="metaMode === 'category' && content.categoryName" class="flex items-center">
          <Icon name="ri:menu-line" class="size-4" />
          <NuxtLink
            v-tooltip="`分类`"
            :to="`/category/${content.categorySlug}`"
            class="mr-1 transition-colors"
            :class="content.covers.length > 0 ? 'hover:text-blue-100' : 'hover:text-blue-600 dark:hover:text-blue-400'">
            {{ content.categoryName }}
          </NuxtLink>
        </span>

        <span v-tooltip="`评论数量`" class="flex items-center">
          <Icon name="ri-chat-2-line" class="size-4" />
          {{ content.commentsNum > 0 ? content.commentsNum : "暂无评论" }}
        </span>
      </div>

      <p
        v-if="content.desc"
        class="text-[0.9em] overflow-wrap break-word"
        :class="content.covers.length > 0 ? 'text-white/70' : 'text-slate-600 dark:text-slate-400'">
        {{ content.desc }}
      </p>
    </div>
  </div>
</template>
