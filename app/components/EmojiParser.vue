<script setup lang="ts">
import emojisData from "~/assets/emojis.json";

const props = defineProps<{
  content: string;
}>();

// 表情分类配置
const categoryConfig: Record<string, { prefix: string }> = {
  "Heo-Sticker": { prefix: "heo-" },
  capoo: { prefix: "猫猫虫-" },
  Cat: { prefix: "cat-" },
};

// 解析表情占位符
const parsedContent = computed(() => {
  const text = props.content;
  if (!text) return "";

  // 匹配 :[category-name] 格式
  const emojiRegex = /:\[([^\]]+)-([^\]]+)\]/g;

  let result = text.replace(emojiRegex, (match, category, name) => {
    const config = categoryConfig[category];
    if (!config) return match;

    const key = config.prefix + name;
    const emojis = emojisData[category as keyof typeof emojisData];
    if (!emojis || !emojis[key]) return match;

    // 返回图片标签
    return `<img src="${emojis[key]}" alt="${name}" class="inline-emoji" loading="lazy" />`;
  });

  return result;
});
</script>

<template>
  <span v-html="parsedContent" />
</template>

<style scoped>
:deep(.inline-emoji) {
  display: inline-block;
  vertical-align: middle;
  width: 24px;
  height: 24px;
  object-fit: contain;
  margin: 0 2px;
}
</style>
