<script setup lang="ts">
// 简单外链卡片：服务端渲染为 .markdown-simple-card-wrapper 占位，客户端组件化挂载。
defineProps<{ url: string; title: string }>();
</script>

<template>
  <div class="markdown-simple-card">
    <a
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      class="block group border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:border-blue-600 dark:hover:border-blue-500 transition-all duration-300 bg-white dark:bg-slate-800"
    >
      <div class="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0 flex-1 text-[16px] leading-snug font-semibold text-slate-900 dark:text-slate-100 truncate">
          {{ title }}
        </div>
        <div class="min-w-0 flex flex-1 items-center justify-end gap-2 text-slate-400 dark:text-slate-500">
          <span class="min-w-0 flex-1 text-xs truncate text-right">{{ url }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </div>
      </div>
    </a>
  </div>
</template>
