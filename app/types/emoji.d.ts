// 表情分类元信息：dataKey 对应 emojis.json 的顶层 key，
// prefix 既是 emoji key 前缀，也是占位符 :[prefix-name] 的前缀。
export interface EmojiCategoryMeta {
  dataKey: string;
  label: string;
  prefix: string;
}

// 面板中单个表情项：key 为 emojis.json 的 key，url 已过 publicAsset，name 为去掉前缀的显示名。
export interface EmojiItem {
  key: string;
  url: string;
  name: string;
}
