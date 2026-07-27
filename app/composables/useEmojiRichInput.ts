// contenteditable 富文本输入引擎：把 `:[key]` 字符串模型 ↔ 可编辑 DOM（文本 + 受控 <img>）互转。
//
// 设计要点（详见 plans/majestic-singing-leaf.md）：
// - DOM 是编辑期的事实源；onInput 只读 DOM→模型，绝不回写 innerHTML（否则光标跳）。
// - 表情 <img contenteditable="false">：浏览器原子单位，退格一次删整张、光标只在图前/图后落点，
//   绝不露出 `:[key]` 占位符。img 由 textToEditableHtml 构造（src/alt/key 单一事实源在 ~/utils/emoji）。
// - img 后插零宽空格（ZWSP）：否则 img 作为末节点时光标贴图右沿、部分引擎拒绝落点（"表情后没法打字"）；
//   readDom 把 ZWSP 从文本节点剥掉，永不进模型。
// - 仅外部改值（提交清空 / 后台切评论 / localStorage 恢复）才重渲染 innerHTML，且在编辑器未聚焦时进行。
//
// enhanced=true（前台）额外启用：自实现撤销/重做历史栈、Ctrl+Z/Y/A、剪切、右键菜单用的
// clipboard 复制/剪切/粘贴、框内拖拽移动文字（+接受外部纯文本拖入，禁图片文件）。
// enhanced=false（后台）保持原生行为：onKeyDown 只管 Enter，drag 一律 preventDefault，cut 走原生。
import { type ComputedRef, type Ref, computed, onMounted, ref, watch } from "vue";

import { buildEmojiPlaceholder, getEmojiByKey, textToEditableHtml } from "~/utils/emoji";

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

// 零宽空格：img 后的可落点文本节点占位，readDom 会从文本里剥掉，永不进模型。
// 用 fromCodePoint 避免 source 里出现不可见字符 / 转义歧义。
const ZWSP = String.fromCodePoint(0x200b);
const ZWSP_RE = new RegExp(ZWSP, "g");

// 撤销历史栈参数：连续打字 400ms 内合并为一条；最多保留 100 条防内存膨胀。
const INPUT_HISTORY_DEBOUNCE = 400;
const MAX_HISTORY = 100;

/** 遍历 DOM 还原 `:[key]` 字符串：文本节点（剥 ZWSP）/ <br>→\n / <img data-emoji-key>→:[key]（未知 img 跳过）。 */
// isTopLevel: 区分顶层 root 与嵌套 div/p，用于识别 Chrome 顶层末尾的 bogus-br。
function readDom(root: HTMLElement, isTopLevel = true): string {
  let out = "";
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent || "").replace(ZWSP_RE, "");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === "BR") {
        // 顶层末尾的孤立 <br> 是 Chrome 的 bogus-br（删光文字后浏览器自动补的占位，
        // 让空编辑器有高度、光标有落点）——不计入模型，否则会污染出多余的末尾 \n。
        // 用户 Enter 产生的 <br> 后必跟 ZWSP 文本节点（不是末尾子节点），不受影响；
        // 嵌套 div/p 内的 <br> 也不走此分支。
        if (isTopLevel && node.nextSibling === null) continue;
        out += "\n";
      } else if (tag === "IMG") {
        const key = el.getAttribute("data-emoji-key");
        // 只信任已知 key（防 devtools/脏草稿伪造任意 :[...] 进模型）
        if (key && getEmojiByKey(key)) out += buildEmojiPlaceholder(key);
      } else if (tag === "DIV" || tag === "P") {
        // 块级元素（防御性：正常 Enter/粘贴路径不产生 div/p，但某些粘贴/浏览器行为可能引入）
        if (out && !out.endsWith("\n")) out += "\n";
        out += readDom(el, false);
        if (!out.endsWith("\n")) out += "\n";
      } else {
        // 行内包裹元素（span 等）：递归取文本
        out += readDom(el, false);
      }
    }
  }
  return out;
}

/** 把光标折叠到编辑器末尾并返回该 Range（选区不在编辑器内时的兜底落点）。 */
function placeCaretAtEnd(editor: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return range;
}

/** 取当前选区落在编辑器内的 Range；不在则把光标移到末尾并返回。 */
function getEditableRange(editor: HTMLElement): Range {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    return sel.getRangeAt(0);
  }
  return placeCaretAtEnd(editor);
}

/** 把多行 `:[key]` 文本构造成可插入的 DocumentFragment（行间 <br>，: [key] 经 textToEditableHtml 变图）。 */
function buildTextFragment(text: string): { frag: DocumentFragment; lastNode: Node | null } {
  const frag = document.createDocumentFragment();
  const lines = text.split("\n");
  let lastNode: Node | null = null;
  lines.forEach((line, idx) => {
    if (idx > 0) lastNode = frag.appendChild(document.createElement("br"));
    if (line) {
      const tmp = document.createElement("div");
      tmp.innerHTML = textToEditableHtml(line);
      while (tmp.firstChild) lastNode = frag.appendChild(tmp.firstChild);
    }
  });
  return { frag, lastNode };
}

/** 在 range 处插入多行文本（删选区内容），光标移到插入内容末尾。 */
function insertFragmentAtRange(range: Range, text: string) {
  range.deleteContents();
  const { frag, lastNode } = buildTextFragment(text);
  range.insertNode(frag);
  const newRange = document.createRange();
  if (lastNode) newRange.setStartAfter(lastNode);
  else newRange.setStart(range.startContainer, range.startOffset);
  newRange.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(newRange);
}

/** 由鼠标坐标取编辑器内的落点 Range；坐标未落在编辑器内则回退到当前选区/末尾。 */
function rangeFromPointInEditor(editor: HTMLElement, x: number, y: number): Range {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let r: Range | null = null;
  if (typeof doc.caretRangeFromPoint === "function") {
    r = doc.caretRangeFromPoint(x, y);
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
    }
  }
  if (r && editor.contains(r.startContainer)) return r;
  return getEditableRange(editor);
}

export function useEmojiRichInput(opts: UseEmojiRichInputOptions): EmojiRichInputHandle {
  const { model, editorRef, onModelRendered, enhanced = false } = opts;

  // 撤销/重做栈（响应式：菜单 disabled 态依赖 canUndo/canRedo）
  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  // 连续打字合并用：上次 push 历史的时间戳；拖拽内部移动的状态。
  let lastPushAt = 0;
  let pendingDrag: { range: Range; text: string } | null = null;
  let internalDrag = false;

  function pushHistory(prev: string) {
    undoStack.value.push(prev);
    redoStack.value = []; // 新操作清空重做栈
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
  }

  function syncFromModel() {
    const editor = editorRef.value;
    if (!editor) return;
    // 编辑器正被使用时不重渲染（光标会跳）；仅同步外部程序化改值。
    if (editor.contains(document.activeElement)) return;
    const html = textToEditableHtml(model.value);
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
    onModelRendered?.(!model.value);
  }

  onMounted(() => {
    const editor = editorRef.value;
    if (!editor) return;
    editor.innerHTML = textToEditableHtml(model.value);
    onModelRendered?.(!model.value);
  });

  // 非立即：onMounted 已做首次填充；后续仅响应外部改值。
  watch(() => model.value, syncFromModel);

  function onInput() {
    const editor = editorRef.value;
    if (!editor) return;
    const prev = model.value;
    const next = readDom(editor);
    if (enhanced) {
      // 连续打字 400ms 内合并为一条撤销：距上次 push 超过阈值才把"改之前"的状态压栈。
      const now = Date.now();
      if (now - lastPushAt > INPUT_HISTORY_DEBOUNCE) pushHistory(prev);
      lastPushAt = now;
    }
    model.value = next;
  }

  /** 在当前选区处插入多行文本（enhanced 时记一条撤销历史）；供 onPaste/pasteFromClipboard/drop 复用。 */
  function insertTextAtSelection(text: string, recordHistory = true) {
    const editor = editorRef.value;
    if (!editor || !text) return;
    if (recordHistory && enhanced) pushHistory(model.value);
    insertFragmentAtRange(getEditableRange(editor), text);
    model.value = readDom(editor);
  }

  function onPaste(e: ClipboardEvent) {
    const editor = editorRef.value;
    const cd = e.clipboardData;
    if (!editor || !cd) return;
    e.preventDefault();
    const text = cd.getData("text/plain");
    if (!text) return;
    insertTextAtSelection(text);
  }

  function onKeyDown(e: KeyboardEvent) {
    // Ctrl/Cmd 快捷键（仅 enhanced；IME 组字中的回车确认不拦）
    if (enhanced && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (k === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      // Ctrl+C/V/X 不拦：复制/粘贴靠 copy/paste 事件，剪切靠 cut 事件（下面 onCut）
    }

    // Enter 插 <br>（跨浏览器一致，避免 Chrome 的 <div> 包裹）；IME 回车确认不能拦。
    if (e.key !== "Enter" || e.isComposing) return;
    const editor = editorRef.value;
    if (!editor) return;
    e.preventDefault();
    if (enhanced) pushHistory(model.value);

    const range = getEditableRange(editor);
    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    // br 后插零宽空格：否则 br 作为末节点会被 Chrome 当 bogus-br（caret-home），
    // 随后输入的文本并入 br 之前那行（实测得到 "Line1Line2<br>" 而非 "Line1<br>Line2"）。
    // zwsp 给新行一个真实落点；readDom 会从文本里剥掉，不污染模型。
    const zwsp = document.createTextNode(ZWSP);
    br.after(zwsp);

    const newRange = document.createRange();
    newRange.setStartAfter(br);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);

    model.value = readDom(editor);
  }

  function onCopy(e: ClipboardEvent) {
    const editor = editorRef.value;
    const cd = e.clipboardData;
    const sel = window.getSelection();
    if (!editor || !cd || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
    // 复制选区内容（克隆）转成 :[key] 文本，而不是 img 的 HTML
    const tmp = document.createElement("div");
    tmp.appendChild(sel.getRangeAt(0).cloneContents());
    e.preventDefault();
    cd.setData("text/plain", readDom(tmp));
  }

  // 剪切（enhanced）：复制 :[key] 文本进剪贴板 + 删除选区 + 记历史；非 enhanced 不拦，走原生 cut。
  function onCut(e: ClipboardEvent) {
    if (!enhanced) return;
    const editor = editorRef.value;
    const cd = e.clipboardData;
    const sel = window.getSelection();
    if (!editor || !cd || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
    pushHistory(model.value);
    const tmp = document.createElement("div");
    tmp.appendChild(sel.getRangeAt(0).cloneContents());
    e.preventDefault();
    cd.setData("text/plain", readDom(tmp));
    sel.deleteFromDocument();
    model.value = readDom(editor);
  }

  function undo() {
    const editor = editorRef.value;
    if (!editor || undoStack.value.length === 0) return;
    redoStack.value.push(model.value);
    const prev = undoStack.value.pop()!;
    model.value = prev;
    // 强制重渲染（即使聚焦）：undo 是程序化改值。focus 后再把光标定到末尾——
    // 菜单触发时编辑器已失焦，不重新 focus 光标不可见、后续打字不进框。
    editor.innerHTML = textToEditableHtml(prev);
    editor.focus();
    placeCaretAtEnd(editor);
  }

  function redo() {
    const editor = editorRef.value;
    if (!editor || redoStack.value.length === 0) return;
    undoStack.value.push(model.value);
    const next = redoStack.value.pop()!;
    model.value = next;
    editor.innerHTML = textToEditableHtml(next);
    editor.focus();
    placeCaretAtEnd(editor);
  }

  function selectAll() {
    const editor = editorRef.value;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // —— 右键菜单用的 clipboard API 入口（与上面的 copy/cut 事件版共用 readDom/插入核心）——

  function copySelection(): Promise<void> {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return Promise.resolve();
    const tmp = document.createElement("div");
    tmp.appendChild(sel.getRangeAt(0).cloneContents());
    return navigator.clipboard.writeText(readDom(tmp)).catch(() => {});
  }

  function cutSelection(): Promise<void> {
    const editor = editorRef.value;
    const sel = window.getSelection();
    if (!editor || !sel || sel.isCollapsed || sel.rangeCount === 0) return Promise.resolve();
    pushHistory(model.value);
    const tmp = document.createElement("div");
    tmp.appendChild(sel.getRangeAt(0).cloneContents());
    const text = readDom(tmp);
    sel.deleteFromDocument();
    model.value = readDom(editor);
    return navigator.clipboard.writeText(text).catch(() => {});
  }

  function pasteFromClipboard(): Promise<void> {
    const editor = editorRef.value;
    return navigator.clipboard
      .readText()
      .then(text => {
        if (!editor || !text) return;
        editor.focus(); // 菜单触发时编辑器失焦，重新聚焦让插入落在框内、光标可见
        insertTextAtSelection(text);
      })
      .catch(() => {
        // 权限拒绝（隐私模式/非安全上下文）静默：用户仍可用 Ctrl+V 走 paste 事件
      });
  }

  // 当前选区是否落在编辑器内且非折叠：供全局右键菜单判断"剪切/复制"是否可用（disabled 态）。
  function hasSelection() {
    const editor = editorRef.value;
    const sel = window.getSelection();
    return !!(
      editor &&
      sel &&
      !sel.isCollapsed &&
      sel.rangeCount > 0 &&
      editor.contains(sel.getRangeAt(0).commonAncestorContainer)
    );
  }

  // —— 拖拽（enhanced）：框内选中文字/表情拖动移动 + 接受外部纯文本拖入；图片/文件禁。
  //   非 enhanced 保持现状：onDragOver/onDrop 一律 preventDefault（禁止拖入外部图片进模型）。——

  function onDragStart(e: DragEvent) {
    if (!enhanced) return;
    const editor = editorRef.value;
    const sel = window.getSelection();
    // 仅在编辑器内有选区时才视为"内部拖拽"（外部拖入不触发编辑器的 dragstart）
    if (!editor || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
    internalDrag = true;
    const range = sel.getRangeAt(0);
    const tmp = document.createElement("div");
    tmp.appendChild(range.cloneContents());
    const text = readDom(tmp);
    pendingDrag = { range: range.cloneRange(), text };
    // 覆盖浏览器默认塞的 img HTML：拖到编辑器外也放出 :[key] 纯文本
    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", text);
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function onDragOver(e: DragEvent) {
    if (!enhanced) {
      e.preventDefault(); // 非 enhanced：禁止一切 drop（现状）
      return;
    }
    // 允许内部移动 或 外部纯文本拖入；含 Files（图片/文件）则不 preventDefault → 拒绝 drop
    const types = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
    if (internalDrag || types.includes("text/plain")) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = internalDrag ? "move" : "copy";
    }
  }

  function onDrop(e: DragEvent) {
    if (!enhanced) {
      e.preventDefault(); // 非 enhanced：禁止（现状）
      return;
    }
    e.preventDefault();
    const editor = editorRef.value;
    if (!editor) return;

    if (pendingDrag) {
      // 框内移动：先删源，再在落点（删源后按坐标重新定位）插入源文本
      pushHistory(model.value);
      pendingDrag.range.deleteContents();
      const dropRange = rangeFromPointInEditor(editor, e.clientX, e.clientY);
      insertFragmentAtRange(dropRange, pendingDrag.text);
      pendingDrag = null;
      internalDrag = false;
      model.value = readDom(editor);
    } else {
      internalDrag = false;
      const text = e.dataTransfer?.getData("text/plain") ?? "";
      if (text) insertTextAtSelection(text); // 内部已 pushHistory
    }
  }

  function onDragEnd() {
    // 取消拖拽（松手在编辑器外）的兜底清理
    pendingDrag = null;
    internalDrag = false;
  }

  function insertEmoji(key: string) {
    const editor = editorRef.value;
    if (!editor) return;

    // 必须在 focus() 之前判断选区是否在编辑器内：focus() 会把从未交互过的
    // contenteditable 光标默认设到"开头"，之后再判断就恒为"在编辑器内"，
    // 导致从面板点表情时插入落到开头而非用户期望的末尾。
    // 用户从未聚焦编辑器 / 点按钮使选区漂移到按钮 → 视为未定位，落末尾追加；
    // 用户已聚焦并定位光标 → 用当前选区，插到光标处。
    const selBefore = window.getSelection();
    const wasInEditor = !!(
      selBefore &&
      selBefore.rangeCount > 0 &&
      editor.contains(selBefore.getRangeAt(0).commonAncestorContainer)
    );

    editor.focus();

    // 经 textToEditableHtml 构造 img（src/alt/属性单一事实源）；未知 key 不产生 img，直接忽略。
    const tmp = document.createElement("div");
    tmp.innerHTML = textToEditableHtml(buildEmojiPlaceholder(key));
    const img = tmp.querySelector("img");
    if (!img) return;

    if (enhanced) pushHistory(model.value);
    const range = wasInEditor && selBefore ? selBefore.getRangeAt(0) : placeCaretAtEnd(editor);
    range.deleteContents();
    range.insertNode(img);
    // img 后插零宽空格，让光标有可落点的文本节点（contenteditable=false 的 img 自身不能承载光标）
    const zwsp = document.createTextNode(ZWSP);
    img.after(zwsp);

    const newRange = document.createRange();
    newRange.setStartAfter(zwsp);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);

    model.value = readDom(editor);
  }

  function focus() {
    const editor = editorRef.value;
    if (!editor) return;
    editor.focus();
    placeCaretAtEnd(editor);
  }

  return {
    onInput,
    onPaste,
    onKeyDown,
    onCopy,
    onCut,
    onDrop,
    onDragOver,
    onDragStart,
    onDragEnd,
    insertEmoji,
    focus,
    readDom,
    undo,
    redo,
    selectAll,
    copySelection,
    cutSelection,
    pasteFromClipboard,
    canUndo,
    canRedo,
    hasSelection,
  };
}
