// 评论区表情的单一事实源。
//
// 关键约定：占位符 :[heo-3d眼镜] 的括号内容恒等于 emojis.json 里的 emoji key 本身
// （见 CommentInput.insertEmoji 生成的 placeholder 与 key 完全一致）。
// 因此解析无需按 `-` 拆前缀，直接用括号内容查 key 即可，避免贪婪正则与 prefix 拆分的脆弱性。

import { publicAsset } from "./asset";

import emojisData from "~/assets/emojis.json";
import type { EmojiDict, EmojiItem, EmojiLookupEntry } from "~/types/emoji";
import { escapeAttribute, escapeHtml } from "#shared/html";
// 表情分类配置与 stripEmojiPrefix 的源头在 ~~shared/emoji-categories（前端/服务端共用）：
// Nitro 不打包 app/，服务端无法 import ~/utils 或 ~/types，故跨边界常量必须放 shared/。
import { EMOJI_CATEGORIES, stripEmojiPrefix } from "#shared/emoji-categories";

// 保持 ~/utils/emoji 既有导入入口兼容（CommentInput 等仍从此 import EMOJI_CATEGORIES）。
export { EMOJI_CATEGORIES, stripEmojiPrefix };

function getEmojiDict(dataKey: string): EmojiDict | undefined {
  return (emojisData as Record<string, EmojiDict>)[dataKey];
}

// 扁平查找表：emoji key -> {原始 path, 显示名}。启动时一次性构建，解析时 O(1) 查找。
const EMOJI_KEY_MAP = new Map<string, EmojiLookupEntry>();
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

  const dict = getEmojiDict(dataKey);
  const list: EmojiItem[] = [];
  if (dict) {
    for (const key of Object.keys(dict)) {
      // 复用启动期算好的 (path, name)，避免对同一 (key, prefix) 重复 stripEmojiPrefix。
      const meta = EMOJI_KEY_MAP.get(key);
      if (!meta) continue;
      list.push({ key, url: publicAsset(meta.path), name: meta.name });
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

// 把评论文本转成「可编辑容器」的 innerHTML：与 parseEmojiContent 同源（先转义再正则替换），
// 但 img 额外带 data-emoji-key（供 readDom 反查 key 还原 :[key]）与 contenteditable="false"
// （让浏览器把表情当作原子插入点：点击只在图前/图后落点、退格一次删整张，绝不露出占位符）。
// 未知 key 仍走 `return match`（保留转义后原文，绝不为攻击者可控 key 生成 img）。
export function textToEditableHtml(text: string): string {
  if (!text) return "";
  const escaped = escapeHtml(text);
  if (!text.includes(":[")) return escaped;
  return escaped.replace(EMOJI_PLACEHOLDER_RE, (match, key: string) => {
    const found = EMOJI_KEY_MAP.get(key);
    if (!found) return match;
    return `<img src="${escapeAttribute(publicAsset(found.path))}" alt="${escapeAttribute(found.name)}" data-emoji-key="${escapeAttribute(key)}" class="inline-emoji" contenteditable="false" />`;
  });
}

// 供 useEmojiRichInput.insertEmoji 构造 <img> 时反查 path/name（key 来自面板，恒为合法 key）。
export function getEmojiByKey(key: string): EmojiLookupEntry | undefined {
  return EMOJI_KEY_MAP.get(key);
}

// 生成写入评论的占位符，格式与既有评论一致：:[heo-3d眼镜]
export function buildEmojiPlaceholder(key: string): string {
  return `:[${key}]`;
}

// 本会话已加载完成的分类（仅客户端读写）。
// SPA 切走再切回时，信任浏览器对 /emojis 静态资源的缓存，跳过 loading overlay。
export const loadedEmojiCategories = new Set<string>();
