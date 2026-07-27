import { type Ref, computed, nextTick, ref } from "vue";

// textarea 撤销/重做历史栈。
//
// 为何需要：MarkdownEditor 的工具栏按钮 / 图片粘贴走 `model.value = 新串` 程序化改值，
// 会清掉 textarea 的原生撤销栈——点工具栏按钮后 Ctrl+Z 撤不回。这里接管 Ctrl+Z/Y，
// 把"工具栏按钮 / 粘贴"（离散操作）和"打字"（去抖合并）各自入栈，undo 能把光标放回原位。
//
// 范式对照 useEmojiRichInput.ts（前台 contenteditable 评论框的自实现撤销）：同样 undoStack/
// redoStack、打字 400ms 去抖合并、MAX_HISTORY=100。textarea 比 contenteditable 简单——
// 模型就是字符串、选区是 selectionStart/End，无需 DOM↔模型互转；条目额外存选区，
// undo 时 setSelectionRange 把光标恢复到改动处（而非一律跳末尾）。

interface HistoryEntry {
  value: string;
  selStart: number;
  selEnd: number;
}

// 连续打字 400ms 内合并为一条撤销；最多保留 100 条防内存膨胀（对齐 useEmojiRichInput）。
const INPUT_HISTORY_DEBOUNCE = 400;
const MAX_HISTORY = 100;

export interface UseTextareaHistoryOptions {
  /** 双向字符串模型（组件层用 defineModel 持有，可写） */
  model: Ref<string>;
  /** textarea 元素引用（由组件 useTemplateRef/ref 持有，传入） */
  textareaRef: Readonly<Ref<HTMLTextAreaElement | null | undefined>>;
}

export interface UseTextareaHistoryHandle {
  canUndo: Ref<boolean>;
  canRedo: Ref<boolean>;
  /** 离散操作（工具栏按钮、粘贴）前调用：立即把当前态入栈，让该操作自成一条撤销步 */
  checkpoint: () => void;
  /** 打字入栈（去抖合并）：传入"本次改之前"的快照；连续输入 400ms 内只压第一条 */
  recordTyping: (prev: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
}

export function useTextareaHistory(opts: UseTextareaHistoryOptions): UseTextareaHistoryHandle {
  const { model, textareaRef } = opts;

  // 响应式：撤回/重做按钮的 disabled 态依赖 canUndo/canRedo。
  const undoStack = ref<HistoryEntry[]>([]);
  const redoStack = ref<HistoryEntry[]>([]);
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  // 上次入栈时间戳：连续打字去抖合并用。
  let lastPushAt = 0;

  /** 读当前 textarea 选区（元素缺失/SSR 时回退 0,0）。 */
  function currentSelection(): { selStart: number; selEnd: number } {
    const ta = textareaRef.value;
    if (!ta) return { selStart: 0, selEnd: 0 };
    return { selStart: ta.selectionStart ?? 0, selEnd: ta.selectionEnd ?? 0 };
  }

  function push(entry: HistoryEntry) {
    undoStack.value.push(entry);
    redoStack.value = []; // 新操作清空重做栈
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
  }

  /**
   * 离散操作（工具栏按钮、粘贴）前调用：立即把"改之前"的当前态入栈。
   * 让每个按钮 / 每次粘贴自成一条撤销步（不被去抖合并）。
   */
  function checkpoint() {
    const { selStart, selEnd } = currentSelection();
    push({ value: model.value, selStart, selEnd });
  }

  /**
   * 打字入栈（去抖合并）：传入"本次改之前"的快照。连续输入 400ms 内只压第一条，
   * 避免逐字符成栈、一次 undo 只撤一个字。
   */
  function recordTyping(prev: HistoryEntry) {
    const now = Date.now();
    if (now - lastPushAt > INPUT_HISTORY_DEBOUNCE) push(prev);
    lastPushAt = now;
  }

  /** clamp 选区到 [0, len]：防条目里的索引超出恢复后的字符串长度（光标越界）。 */
  function clamp(sel: number, len: number) {
    return Math.max(0, Math.min(sel, len));
  }

  /**
   * 应用一条历史：把当前态压入对侧栈，弹出本侧条目写入模型，nextTick 恢复选区。
   * 程序化改 model.value 不触发 textarea 的 @input，故不会重复入栈，无需 suppress 标志。
   */
  function applyEntry(entry: HistoryEntry, toStack: HistoryEntry[]) {
    const { selStart, selEnd } = currentSelection();
    toStack.push({ value: model.value, selStart, selEnd });
    model.value = entry.value;
    const len = entry.value.length;
    const start = clamp(entry.selStart, len);
    const end = clamp(entry.selEnd, len);
    // 等 Vue 把 :value 同步到 DOM 后再定选区，否则 setSelectionRange 作用在旧值上越界。
    nextTick(() => {
      const ta = textareaRef.value;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }

  function undo() {
    if (undoStack.value.length === 0) return;
    const entry = undoStack.value.pop()!;
    applyEntry(entry, redoStack.value);
  }

  function redo() {
    if (redoStack.value.length === 0) return;
    const entry = redoStack.value.pop()!;
    applyEntry(entry, undoStack.value);
  }

  return { canUndo, canRedo, checkpoint, recordTyping, undo, redo };
}
