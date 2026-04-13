<script setup lang="ts">
import emojisData from "~/assets/emojis.json";

const props = defineProps<{
  content: string;
}>();

// 表情分类配置（通过前缀映射）
const prefixConfig: Record<string, { dataKey: string; filePrefix: string }> = {
  "heo": { dataKey: "Heo-Sticker", filePrefix: "heo-" },
  "猫猫虫": { dataKey: "capoo", filePrefix: "猫猫虫-" },
  "cat": { dataKey: "Cat", filePrefix: "cat-" },
};

// 解析表情占位符
const parsedContent = computed(() => {
  const text = props.content;
  if (!text) return "";

  // 匹配 :[prefix-name] 格式
  const emojiRegex = /:\[([^\]]+)-([^\]]+)\]/g;

  let result = text.replace(emojiRegex, (match, prefix, name) => {
    const config = prefixConfig[prefix];
    if (!config) return match;

    const key = config.filePrefix + name;
    const emojis = emojisData[config.dataKey as keyof typeof emojisData];
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
  width: 48px;
  height: 48px;
  object-fit: contain;
  margin: 0 2px;
}
</style>
