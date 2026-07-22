<script setup lang="ts">
import { parseEmojiContent } from "~/utils/emoji";

const props = defineProps<{
  content: string;
}>();

// 解析在 ~/utils/emoji 内完成：先转义原文，再把 :[key] 占位符替换为受控 img，
// 避免 v-html 注入；命中失败时保留原占位符文本。
const parsedContent = computed(() => parseEmojiContent(props.content));
</script>

<template>
  <span v-html="parsedContent" />
</template>

<style scoped>
:deep(.inline-emoji) {
  display: inline-block;
  vertical-align: middle;
  width: 48px;
  height: 48px;
  object-fit: contain;
  margin: 0 2px;
}
</style>
