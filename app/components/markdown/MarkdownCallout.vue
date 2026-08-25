<script setup lang="ts">
// 提示框（callout）：服务端渲染为 .markdown-callout-wrapper 占位，客户端组件化挂载。
const props = defineProps<{ type: string; content: string }>();

const configs = {
  success: {
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-200 dark:border-green-800",
    textColor: "text-green-900 dark:text-green-100",
    iconColor: "text-green-600 dark:text-green-400",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  },
  warning: {
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    textColor: "text-yellow-900 dark:text-yellow-100",
    iconColor: "text-yellow-600 dark:text-yellow-400",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  },
  error: {
    bgColor: "bg-red-50 dark:bg-red-900/20",
    borderColor: "border-red-200 dark:border-red-800",
    textColor: "text-red-900 dark:text-red-100",
    iconColor: "text-red-600 dark:text-red-400",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
  },
  info: {
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-900 dark:text-blue-100",
    iconColor: "text-blue-600 dark:text-blue-400",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  },
} as const;

const config = configs[props.type as keyof typeof configs] ?? configs.info;
</script>

<template>
  <div class="markdown-callout p-4 rounded-lg border" :class="[config.bgColor, config.borderColor]">
    <div class="flex items-start gap-3">
      <div class="shrink-0 mt-1" :class="config.iconColor" v-html="config.icon" />
      <div class="flex-1" :class="config.textColor">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="content" />
      </div>
    </div>
  </div>
</template>
