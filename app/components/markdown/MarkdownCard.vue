<script setup lang="ts">
// 外链卡片：服务端渲染为 .markdown-card-wrapper 占位，客户端组件化挂载。
defineProps<{ url: string; title: string; description: string; image: string }>();
</script>

<template>
  <div class="markdown-card">
    <a
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      class="block group border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:border-blue-600 dark:hover:border-blue-500 transition-all duration-300 bg-white dark:bg-slate-800"
    >
      <div class="flex min-w-0">
        <div v-if="image" class="w-36 h-36 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-900 max-xs:hidden">
          <img
            :src="image"
            :alt="title"
            class="size-full object-cover markdown-card__thumb"
            loading="lazy"
            decoding="async"
          >
        </div>
        <div class="min-w-0 flex-1 p-5 flex flex-col justify-center">
          <div class="flex min-w-0 items-start justify-between gap-3 mb-2">
            <div class="min-w-0 text-[18px] leading-snug font-bold text-slate-900 dark:text-slate-100 line-clamp-2 wrap-break-word">
              {{ title }}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          </div>
          <p v-if="description" class="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed wrap-break-word">
            {{ description }}
          </p>
          <div class="mt-3 flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3 shrink-0"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span class="min-w-0 flex-1 truncate">{{ url }}</span>
          </div>
        </div>
      </div>
    </a>
  </div>
</template>
