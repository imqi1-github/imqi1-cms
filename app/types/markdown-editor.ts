/**
 * 后台 Tiptap 富文本编辑器相关类型。
 *
 * 编辑器对外仍是 markdown 字符串（v-model），内部把自定义 `:::xxx` 容器抽成
 * 不透明原子节点（CustomContainer），在加载/回写边界用 splitMarkdown 切分，
 * 容器块原样保留、标准 markdown 走 tiptap-markdown 解析。详见：
 * - app/utils/markdownSplit.ts
 * - app/components/markdown-editor/extensions/CustomContainer.ts
 */

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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
  /** 已知容器有确定类型；解析失败/未知容器的兜底为 null（见 UNKNOWN_CONTAINER_META）。 */
  type: ContainerType | null;
  label: string;
  /** lucide 图标名（供 <Icon name=...>）。 */
  icon: string;
}

/** splitMarkdown 的输出段：要么是标准 markdown 片段，要么是一整块 ::: 容器原文。 */
export type MarkdownSegment =
  | { kind: "md"; text: string }
  | { kind: "container"; raw: string };

/** prosemirror-markdown 序列化器 state 用到的最小子集（避免在扩展内引入其类型依赖）。 */
export interface MarkdownSerializerStateLike {
  write(content: string): void;
  closeBlock(node: ProseMirrorNode): void;
}

/** callout 容器变体（:::callout success/warning/error/info），供占位块按变体着色，与服务端正则保持一致。 */
export type CalloutVariant = "success" | "warning" | "error" | "info";

/**
 * 格式/表格工具栏动作集（父组件 MarkdownEditor 闭包集合）。
 * 用具体键名而非 Record<string, ...>，让父组件缺键/改名在类型检查期就报错。
 */
export interface ToolbarActions {
  undo(): void;
  redo(): void;
  bold(): void;
  italic(): void;
  underline(): void;
  strikethrough(): void;
  heading1(): void;
  heading2(): void;
  heading3(): void;
  heading4(): void;
  heading5(): void;
  heading6(): void;
  quote(): void;
  code(): void;
  codeBlock(): void;
  link(): void;
  image(): void;
  livePhoto(): void;
  ul(): void;
  ol(): void;
  hr(): void;
  table(): void;
  tableAddRowBefore(): void;
  tableAddRowAfter(): void;
  tableDeleteRow(): void;
  tableAddColumnBefore(): void;
  tableAddColumnAfter(): void;
  tableDeleteColumn(): void;
  tableToggleHeaderRow(): void;
  tableMergeCells(): void;
  tableSplitCell(): void;
  tableDelete(): void;
  details(): void;
  video(): void;
  success(): void;
  warning(): void;
  error(): void;
  info(): void;
  card(): void;
  simpleCard(): void;
  swiper(): void;
  waterfall(): void;
  githubRepo(): void;
  giteeRepo(): void;
  musicAuto(): void;
  musicSong(): void;
  musicPlaylist(): void;
}

/** 格式/表格工具栏的活性状态（光标所在位置的格式高亮），随父组件事务刷新。 */
export interface ToolbarActiveFlags {
  table: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  codeBlock: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  h4: boolean;
  h5: boolean;
  h6: boolean;
  livePhoto: boolean;
  video: boolean;
  details: boolean;
  success: boolean;
  warning: boolean;
  error: boolean;
  info: boolean;
  card: boolean;
  simpleCard: boolean;
  swiper: boolean;
  waterfall: boolean;
  githubRepo: boolean;
  giteeRepo: boolean;
  musicAuto: boolean;
  musicSong: boolean;
  musicPlaylist: boolean;
}

/** 编辑器 storage（tiptap-markdown 序列化/解析的收窄类型）。 */
export interface MarkdownStorage {
  getMarkdown: () => string;
  parser: { parse: (content: string, opts?: { inline?: boolean }) => string };
}

/** 链接/图片插入弹窗状态。 */
export interface LinkImagePromptState {
  open: boolean;
  mode: "link" | "image";
  url: string;
  alt: string;
  text: string;
}

/** 表格创建弹窗状态。 */
export interface TableCreateState {
  open: boolean;
  rows: number;
  cols: number;
  withHeaderRow: boolean;
}
