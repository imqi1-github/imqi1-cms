// 评论区表情的单一事实源。
//
// 关键约定：占位符 :[heo-3d眼镜] 的括号内容恒等于 emojis.json 里的 emoji key 本身
// （见 CommentInput.insertEmoji 生成的 placeholder 与 key 完全一致）。
// 因此解析无需按 `-` 拆前缀，直接用括号内容查 key 即可，避免贪婪正则与 prefix 拆分的脆弱性。

import { publicAsset } from "./asset";

import emojisData from "~/assets/emojis.json";
import type { EmojiCategoryMeta, EmojiItem } from "~/types/emoji";
import { escapeAttribute, escapeHtml } from "~~/lib/html";

// 表情分类配置（单一事实源）
export const EMOJI_CATEGORIES: EmojiCategoryMeta[] = [
  { dataKey: "Heo-Sticker", label: "Heo表情", prefix: "heo-" },
  { dataKey: "capoo", label: "猫猫虫", prefix: "猫猫虫-" },
  { dataKey: "Cat", label: "猫咪", prefix: "cat-" },
];

type EmojiDict = Record<string, string>;

function getEmojiDict(dataKey: string): EmojiDict | undefined {
  return (emojisData as Record<string, EmojiDict>)[dataKey];
}

// 去掉 emoji key 的分类前缀，得到显示名（替代脆弱的 String.replace）。
export function stripEmojiPrefix(key: string, prefix: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

// 扁平查找表：emoji key -> {原始 path, 显示名}。启动时一次性构建，解析时 O(1) 查找。
const EMOJI_KEY_MAP = new Map<string, { path: string; name: string }>();
for (const cat of EMOJI_CATEGORIES) {
  const dict = getEmojiDict(cat.dataKey);
  if (!dict) continue;
  for (const [key, path] of Object.entries(dict)) {
    EMOJI_KEY_MAP.set(key, { path, name: stripEmojiPrefix(key, cat.prefix) });
  }
}

// 按分类缓存表情列表（url 已过 publicAsset）。cdnBase 启动后不变，缓存安全；
// 首次调用发生在组件 setup/computed 内，publicAsset 可访问 runtimeConfig。
const emojiListCache = new Map<string, EmojiItem[]>();

export function getEmojiList(dataKey: string): EmojiItem[] {
  const cached = emojiListCache.get(dataKey);
  if (cached) return cached;

  const cat = EMOJI_CATEGORIES.find(c => c.dataKey === dataKey);
  const dict = getEmojiDict(dataKey);
  const list: EmojiItem[] = [];
  if (cat && dict) {
    for (const [key, path] of Object.entries(dict)) {
      list.push({ key, url: publicAsset(path), name: stripEmojiPrefix(key, cat.prefix) });
    }
  }
  emojiListCache.set(dataKey, list);
  return list;
}

const EMOJI_PLACEHOLDER_RE = /:\[([^\]]+)\]/g;

// 解析评论文本：先转义原始文本，命中 :[key] 的占位符替换为受控 img，避免 v-html 注入。
export function parseEmojiContent(text: string): string {
  if (!text) return "";
  const escaped = escapeHtml(text);
  // 绝大多数评论不含表情，提前跳过正则替换。
  if (!text.includes(":[")) return escaped;
  return escaped.replace(EMOJI_PLACEHOLDER_RE, (match, key: string) => {
    const found = EMOJI_KEY_MAP.get(key);
    if (!found) {
      if (import.meta.dev) console.warn("[emoji] 未识别的表情占位符:", match);
      return match;
    }
    return `<img src="${escapeAttribute(publicAsset(found.path))}" alt="${escapeAttribute(found.name)}" class="inline-emoji" />`;
  });
}

// 生成写入评论的占位符，格式与既有评论一致：:[heo-3d眼镜]
export function buildEmojiPlaceholder(key: string): string {
  return `:[${key}]`;
}

// 本会话已加载完成的分类（仅客户端读写）。
// SPA 切走再切回时，信任浏览器对 /emojis 静态资源的缓存，跳过 loading overlay。
export const loadedEmojiCategories = new Set<string>();
