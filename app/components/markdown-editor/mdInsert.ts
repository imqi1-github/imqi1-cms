/**
 * Markdown 源码模式下的光标/选区插入原语。
 *
 * MarkdownEditor 的 Markdown tab 是一个 `<textarea v-model="model">`。工具栏在源码模式下
 * 点击时,由这些函数在当前选区/光标处插入对应的 markdown 语法,并同步 model 与光标位置。
 *
 * 所有函数都是同步、就地替换、幂等的正文编辑小工具;`model` 是 defineModel 的 ref(可写),
 * 直接赋值即可双向同步到父组件(内容字符串),无需派发 input(defineModel 即源)。
 *
 * @module markdown-editor/mdInsert
 */

/** textarea value 的极简可写引用(避免与 defineModel 强耦合,Mock 时也可传 { value }) */
export interface MdModelRef {
  value: string;
}

/** 要变更的选区/光标目标(当前 textarea 元素;未挂载时各函数直接 no-op)。 */
export type MdTarget = HTMLTextAreaElement | null;

/** 在 [start, end) 处把文本替换成 next,并把光标/选区落到 [caretStart, caretEnd),同步 model。 */
function applyEdit(
  ta: HTMLTextAreaElement,
  model: MdModelRef,
  next: string,
  caretStart: number,
  caretEnd: number,
) {
  // 先写 DOM 值与光标,再写 model:Vue 的 :value 绑定在 next 轮 patch 时看到 ta.value 已相等,
  // 不会重置选区;反过来(先 model 后 DOM)会因 Vue 写 value 触发光标跳到末尾。
  ta.value = next;
  ta.setSelectionRange(caretStart, caretEnd);
  model.value = next;
  ta.focus();
}

/**
 * 用 before/after 包裹当前选区(空选区插入成对标记,光标落在中间)。
 * 例:加粗 mdWrap("**","**")、"**被选中文字**"。
 */
export function mdWrap(ta: MdTarget, model: MdModelRef, before: string, after: string): void {
  if (!ta) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  const hasSel = sel.length > 0;
  const next = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
  const caret = s + before.length;
  // 有选区则整段选中(便于再次套用/删除),否则光标落在两个标记之间
  applyEdit(ta, model, next, caret, hasSel ? e + before.length : caret);
}

/**
 * 把 prefix 加到当前行首(或选区覆盖的每行行首)。
 * 例:heading mdPrefixLine("# ")、引用 mdPrefixLine("> ")、无序列表 mdPrefixLine("- ")。
 */
export function mdPrefixLine(ta: MdTarget, model: MdModelRef, prefix: string): void {
  if (!ta) return;
  const value = ta.value;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const nlAfter = value.indexOf("\n", e);
  const lineEnd = nlAfter === -1 ? value.length : nlAfter;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  // 光标落到第一个 prefix 之后,方便继续输入内容
  applyEdit(ta, model, next, lineStart + prefix.length, lineStart + prefix.length);
}

/** 在光标处插入纯文本(光标落在插入内容之后)。例:分割线 "\n---\n"。 */
export function mdInsertText(ta: MdTarget, model: MdModelRef, text: string): void {
  if (!ta) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const next = ta.value.slice(0, s) + text + ta.value.slice(e);
  const caret = s + text.length;
  applyEdit(ta, model, next, caret, caret);
}

/**
 * 插入一段需把光标落在指定偏移的模板(如链接 `[]()`,光标落到 `[]` 内便于直接输入文字)。
 * `caret` 为相对插入起点 0 的偏移;有选区时替换选区。
 */
export function mdInsertSnippet(ta: MdTarget, model: MdModelRef, text: string, caret: number): void {
  if (!ta) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const next = ta.value.slice(0, s) + text + ta.value.slice(e);
  const c = s + caret;
  applyEdit(ta, model, next, c, c);
}
