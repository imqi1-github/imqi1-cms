/**
 * useRichInputRegistry（RichInput 注册表）类型定义：
 * 富文本 contenteditable 编辑器（EmojiRichInput）暴露给全局右键菜单的句柄。
 */

export interface RichInputHandle {
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  copySelection: () => Promise<void>;
  cutSelection: () => Promise<void>;
  pasteFromClipboard: () => Promise<void>;
  /** 撤销栈是否非空（菜单"撤销"disabled 态） */
  canUndo: () => boolean;
  /** 重做栈是否非空（菜单"重做"disabled 态） */
  canRedo: () => boolean;
  /** 当前选区是否落在编辑器内且非折叠（菜单"剪切/复制"disabled 态） */
  hasSelection: () => boolean;
}