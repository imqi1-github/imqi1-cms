<script setup lang="ts">
import emojisData from "~/assets/emojis.json";
import { escapeAttribute, escapeHtml } from "~~/lib/html";

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

  // 先转义原始文本，再插入受控的表情 img，避免未命中内容通过 v-html 执行
  const escapedText = escapeHtml(text);

  // 匹配 :[prefix-name] 格式
  const emojiRegex = /:\[([^\]]+)-([^\]]+)\]/g;

  let result = escapedText.replace(emojiRegex, (match, prefix, name) => {
    const config = prefixConfig[prefix];
    if (!config) return match;

    const key = config.filePrefix + name;
    const emojis = emojisData[config.dataKey as keyof typeof emojisData] as Record<string, string> | undefined;
    if (!emojis || !emojis[key]) return match;

    // 获取表情图片URL（生产环境且配置了 CDN 时自动加前缀）
    const emojiUrl = publicAsset(emojis[key]!);

    // 返回受控图片标签
    return `<img src="${escapeAttribute(emojiUrl)}" alt="${escapeAttribute(name)}" class="inline-emoji" loading="lazy" />`;
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
