<script setup lang="ts">
import emojisData from "~/assets/emojis.json";
import { siteConfig } from "~~/site.config";

const props = defineProps<{
  content: string;
}>();

// 表情分类配置（通过前缀映射）
const prefixConfig: Record<string, { dataKey: string; filePrefix: string }> = {
  "heo": { dataKey: "Heo-Sticker", filePrefix: "heo-" },
  "猫猫虫": { dataKey: "capoo", filePrefix: "猫猫虫-" },
  "cat": { dataKey: "Cat", filePrefix: "cat-" },
};

// 获取表情图片URL（生产环境使用 CDN 基础域名，不携带构建哈希目录）
const getEmojiUrl = (path: string) => {
  // 只在生产环境下使用 CDN
  if (!import.meta.env.PROD || !siteConfig.cdnUrl) return path;
  // 如果有CDN，将路径中的 /emojis/ 替换为 CDN URL + /emojis/
  return path.replace(/^\/emojis\//, `${siteConfig.cdnUrl}/emojis/`);
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
    const emojis = emojisData[config.dataKey as keyof typeof emojisData] as Record<string, string> | undefined;
    if (!emojis || !emojis[key]) return match;

    // 获取表情图片URL（根据CDN配置动态生成）
    const emojiUrl = getEmojiUrl(emojis[key]!);

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
