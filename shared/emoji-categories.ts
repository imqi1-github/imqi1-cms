// 表情分类配置的单一事实源：前端 app/utils/emoji.ts 与服务端 server/utils/emoji-mail.ts 共用。
// 放在 ~~shared/ 是为了跨 app/server 边界——Nitro 不打包 app/，服务端无法 import ~/utils 或 ~/types，
// 所以分类配置（构建表情查找表的前端/服务端两边都用）必须落在 shared/。
//
// 约定：
// - dataKey 对应 app/assets/emojis.json 的顶层 key（如 "Heo-Sticker"）；
// - prefix 既是 emoji key 的前缀，也是占位符 :[prefix-name] 的前缀
//   （见 app/utils/emoji.ts 与 CommentInput.insertEmoji：括号内容恒等于 emoji key 本身）。
export interface EmojiCategoryMeta {
  dataKey: string;
  label: string;
  prefix: string;
}

export const EMOJI_CATEGORIES: EmojiCategoryMeta[] = [
  { dataKey: "Heo-Sticker", label: "Heo表情", prefix: "heo-" },
  { dataKey: "capoo", label: "猫猫虫", prefix: "猫猫虫-" },
  { dataKey: "Cat", label: "猫咪", prefix: "cat-" },
];

// 去掉 emoji key 的分类前缀，得到显示名（替代脆弱的 String.replace）。
export function stripEmojiPrefix(key: string, prefix: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}
