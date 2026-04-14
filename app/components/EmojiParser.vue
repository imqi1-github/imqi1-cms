<script setup lang="ts">
import emojisData from "~/assets/emojis.json";

const props = defineProps<{
  content: string;
}>();

// 获取 CDN 配置
const config = useRuntimeConfig();
const cdnURL = (config.public.cdnURL as string) || "";

// 表情分类配置（通过前缀映射）
const prefixConfig: Record<string, { dataKey: string; filePrefix: string }> = {
  "heo": { dataKey: "Heo-Sticker", filePrefix: "heo-" },
  "猫猫虫": { dataKey: "capoo", filePrefix: "猫猫虫-" },
  "cat": { dataKey: "Cat", filePrefix: "cat-" },
};

// 获取表情图片URL（根据是否有CDN返回不同路径）
const getEmojiUrl = (path: string) => {
  if (!cdnURL) return path;
  // 如果有CDN，将路径中的 /emojis/ 替换为 CDN URL + /emojis/
  return path.replace(/^\/emojis\//, `${cdnURL}/emojis/`);
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

    // 获取表情图片URL（根据CDN配置动态生成）
    const emojiUrl = getEmojiUrl(emojis[key]);

    // 返回图片标签
    return `<img src="${emojiUrl}" alt="${name}" class="inline-emoji" loading="lazy" />`;
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
