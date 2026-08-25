/**
 * EmojiRichInput（useEmojiRichInput / EmojiRichInput.vue）类型定义：
 * contenteditable 富文本引擎——把 `:[key]` 字符串模型 ↔ 可编辑 DOM（文本 + 受控 <img>）互转。
 */

import type { ComputedRef, Ref } from "vue";

/** 旧 WebKit/Firefox 的 caret 定位 API：部分环境只实现其一，且 TS 标准库未声明 */
export interface DocWithCaretRange extends Document {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
}

export interface UseEmojiRichInputOptions {
  /** `:[key]` 字符串模型（双向） */
  model: Ref<string>;
  /** 可编辑容器元素引用（由组件 useTemplateRef 持有，传入） */
  editorRef: Readonly<Ref<HTMLElement | null>>;
  /** 模型→DOM 渲染后回调（用于切换占位符 is-empty 态） */
  onModelRendered?: (isEmpty: boolean) => void;
  /** true=前台编辑增强（撤销/重做、Ctrl 快捷键、剪切、clipboard、拖拽移动、右键菜单）；false=后台保持原生 */
  enhanced?: boolean;
}

export interface EmojiRichInputHandle {
  onInput: (e: Event) => void;
  onPaste: (e: ClipboardEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onCopy: (e: ClipboardEvent) => void;
  onCut: (e: ClipboardEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  /** 在光标处插入表情（选区不在编辑器内则追加到末尾）；面板连插多个时保持聚焦 */
  insertEmoji: (key: string) => void;
  /** 聚焦并把光标移到末尾 */
  focus: () => void;
  /** 读取 DOM→`:[key]` 字符串（导出供回环测试/复制） */
  readDom: (root: HTMLElement) => string;
  /** 撤销/重做（enhanced） */
  undo: () => void;
  redo: () => void;
  /** 全选编辑器内容（enhanced；Ctrl+A 与右键菜单共用） */
  selectAll: () => void;
  /** 右键菜单复制/剪切/粘贴（走 clipboard API；enhanced） */
  copySelection: () => Promise<void>;
  cutSelection: () => Promise<void>;
  pasteFromClipboard: () => Promise<void>;
  /** 菜单 disabled 态 */
  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;
  /** 当前选区是否落在编辑器内且非折叠（菜单剪切/复制 disabled 态） */
  hasSelection: () => boolean;
}
