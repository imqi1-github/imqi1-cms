// 富文本编辑器（contenteditable EmojiRichInput）实例注册表。
// 把每个 enhanced editor 的编辑句柄（undo/redo/selectAll/copy/cut/paste + 状态查询）
// 以 editor DOM 元素为 key 注册，供全局 ContextMenu.vue 反查——右键 contenteditable 时，
// 全局菜单据此判断是否追加"编辑项"分支、并调用对应实例的方法（撤销栈等是每实例私有，全局菜单拿不到）。
// WeakMap 以 DOM 元素为 key：元素销毁即自动 GC；组件层仍成对 register/unregister 兜底
//（CommentInput 走 v-if，回复框展开/取消会频繁 mount/unmount EmojiRichInput）。

/** 暴露给全局右键菜单的编辑句柄（引擎 handle 的转发子集 + 状态查询）。 */
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

const registry = new WeakMap<HTMLElement, RichInputHandle>();

export function registerRichInput(el: HTMLElement, handle: RichInputHandle) {
  registry.set(el, handle);
}

export function unregisterRichInput(el: HTMLElement) {
  registry.delete(el);
}

/**
 * 由右键 target 反查最近且**已注册**的富文本编辑器句柄。
 * 右键事件 target 可能是编辑器内任意后代（文本/表情 img/span），用 closest 跳过
 * contenteditable="false" 的表情图、找到 contenteditable="true" 的编辑器根，再查注册表。
 * 未注册（enhanced=false 的后台、或非 EmojiRichInput 的 contenteditable）返回 null
 * → 全局菜单退回 default/text 分支（现状不变）。
 */
export function findRichInputHandle(
  target: Element | null,
): { editor: HTMLElement; handle: RichInputHandle } | null {
  const editor = target?.closest<HTMLElement>('[contenteditable="true"]');
  if (!editor) return null;
  const handle = registry.get(editor);
  return handle ? { editor, handle } : null;
}
