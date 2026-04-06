<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  summary?: string;
}>();

const isOpen = ref(false);

function toggle() {
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <div class="markdown-details my-4 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
    <button
      @click="toggle"
      class="markdown-details-summary w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 text-left flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
      <span class="font-medium text-slate-900 dark:text-slate-100">{{ summary || "点击展开/收起" }}</span>
      <span
        class="transform transition-transform duration-200 text-slate-500 dark:text-slate-400 text-[10px]"
        :class="{ 'rotate-180': isOpen }">
        ▼
      </span>
    </button>
    <div
      v-show="isOpen"
      class="markdown-details-content px-4 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.markdown-details summary {
  list-style: none;
}

.markdown-details summary::-webkit-details-marker {
  display: none;
}
</style>
