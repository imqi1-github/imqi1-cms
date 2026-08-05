/**
 * 后台 Tiptap 富文本编辑器相关类型。
 *
 * 编辑器对外仍是 markdown 字符串（v-model），内部把自定义 `:::xxx` 容器抽成
 * 不透明原子节点（CustomContainer），在加载/回写边界用 splitMarkdown 切分，
 * 容器块原样保留、标准 markdown 走 tiptap-markdown 解析。详见：
 * - app/utils/markdownSplit.ts
 * - app/components/markdown-editor/extensions/CustomContainer.ts
 */

/** 服务端 server/utils/markdown.ts 支持的自定义容器名（::: 后的标识符）。 */
export type ContainerType =
  | "live-photo"
  | "video"
  | "callout"
  | "card"
  | "simple-card"
  | "swiper"
  | "waterfall"
  | "repo"
  | "music"
  | "details";

/** 容器在编辑器内占位块展示用的元信息：图标 + 友好标签。 */
export interface ContainerMeta {
  type: ContainerType;
  label: string;
  /** lucide 图标名（供 <Icon name=...>）。 */
  icon: string;
}

/** splitMarkdown 的输出段：要么是标准 markdown 片段，要么是一整块 ::: 容器原文。 */
export type MarkdownSegment =
  | { kind: "md"; text: string }
  | { kind: "container"; raw: string };
