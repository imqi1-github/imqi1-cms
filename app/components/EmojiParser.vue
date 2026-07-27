<script setup lang="ts">
import { parseEmojiContent } from "~/utils/emoji";

const props = withDefaults(
  defineProps<{
    content: string;
    /** 表情尺寸：lg=48px（评论详情，默认）；sm=1.6em（最近评论/后台表格等紧凑场景，跟随字号）。 */
    size?: "lg" | "sm";
  }>(),
  { size: "lg" },
);

// 解析在 ~/utils/emoji 内完成：先转义原文，再把 :[key] 占位符替换为受控 img，
// 避免 v-html 注入；命中失败时保留原占位符文本。
const parsedContent = computed(() => parseEmojiContent(props.content));
</script>

<template>
  <span :class="size === 'sm' ? 'emoji-sm' : 'emoji-lg'" v-html="parsedContent" />
</template>

<style scoped>
/* 尺寸由父 span 的 class 分支控制：v-html 注入的 .inline-emoji 不带 scope hash，需 :deep 命中。 */
:deep(.inline-emoji) {
  display: inline-block;
  vertical-align: middle;
  object-fit: contain;
  margin: 0 2px;
}
.emoji-lg :deep(.inline-emoji) {
  width: 48px;
  height: 48px;
}
.emoji-sm :deep(.inline-emoji) {
  width: 1.6em;
  height: 1.6em;
}
</style>
