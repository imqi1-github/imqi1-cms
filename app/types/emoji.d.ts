// EmojiCategoryMeta 的源头在 #shared/emoji-categories（前端/服务端共用），此处 re-export 保持 ~/types/emoji 入口兼容。
export type { EmojiCategoryMeta } from "#shared/emoji-categories";

// 单个分类下的 emoji 字典：emojis.json 中每条目形如 { "<emoji-key>": "<path>" }。
// 此类型仅供 app/utils/emoji 在加载期对 JSON 做 Record 断言，避免在 utils 内联顶层 type。
export type EmojiDict = Record<string, string>;

// 面板中单个表情项：key 为 emojis.json 的 key，url 已过 publicAsset，name 为去掉前缀的显示名。
export interface EmojiItem {
  key: string;
  url: string;
  name: string;
}

// 扁平查找表条目：原始 path（未过 publicAsset）+ 显示名，供解析把 key 反查成 <img>。
export interface EmojiLookupEntry {
  path: string;
  name: string;
}
