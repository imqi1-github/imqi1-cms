// EmojiCategoryMeta 的源头在 ~~shared/emoji-categories（前端/服务端共用），此处 re-export 保持 ~/types/emoji 入口兼容。
export type { EmojiCategoryMeta } from "~~/shared/emoji-categories";

// 面板中单个表情项：key 为 emojis.json 的 key，url 已过 publicAsset，name 为去掉前缀的显示名。
export interface EmojiItem {
  key: string;
  url: string;
  name: string;
}
