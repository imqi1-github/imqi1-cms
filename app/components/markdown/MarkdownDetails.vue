<script setup lang="ts">
import { ref } from "vue";

// 折叠容器：首页由服务端渲染为 .markdown-details-wrapper 占位，客户端组件化挂载（原在页面内 innerHTML 构建）。
defineProps<{
  summary: string;
  content: string;
}>();

const open = ref(false);
</script>

<template>
  <div class="markdown-details border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
    <button
      class="markdown-details-summary w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 text-left flex items-center justify-start gap-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="transform transition-transform duration-200 text-slate-500 dark:text-slate-400 text-[10px]" :class="{ 'rotate-180': open }">
        ▼
      </span>
      <span class="font-medium text-slate-900 dark:text-slate-100">{{ summary }}</span>
    </button>
    <div class="markdown-details-content px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700" :class="{ hidden: !open }">
      <!-- v-html：摘要内容由服务端 markdown 渲染，为可信 HTML（DOMPurify 已在渲染管线处理） -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-html="content" />
    </div>
  </div>
</template>
