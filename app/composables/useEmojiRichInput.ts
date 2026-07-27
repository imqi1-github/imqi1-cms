// contenteditable 富文本输入引擎：把 `:[key]` 字符串模型 ↔ 可编辑 DOM（文本 + 受控 <img>）互转。
//
// 设计要点（详见 plans/majestic-singing-leaf.md）：
// - DOM 是编辑期的事实源；onInput 只读 DOM→模型，绝不回写 innerHTML（否则光标跳）。
// - 表情 <img contenteditable="false">：浏览器原子单位，退格一次删整张、光标只在图前/图后落点，
//   绝不露出 `:[key]` 占位符。img 由 textToEditableHtml 构造（src/alt/key 单一事实源在 ~/utils/emoji）。
// - img 后插零宽空格（ZWSP）：否则 img 作为末节点时光标贴图右沿、部分引擎拒绝落点（"表情后没法打字"）；
//   readDom 把 ZWSP 从文本节点剥掉，永不进模型。
// - 仅外部改值（提交清空 / 后台切评论 / localStorage 恢复）才重渲染 innerHTML，且在编辑器未聚焦时进行。
import { type Ref, onMounted, watch } from "vue";

import { buildEmojiPlaceholder, getEmojiByKey, textToEditableHtml } from "~/utils/emoji";

export interface UseEmojiRichInputOptions {
  /** `:[key]` 字符串模型（双向） */
  model: Ref<string>;
  /** 可编辑容器元素引用（由组件 useTemplateRef 持有，传入） */
  editorRef: Readonly<Ref<HTMLElement | null>>;
  /** 模型→DOM 渲染后回调（用于切换占位符 is-empty 态） */
  onModelRendered?: (isEmpty: boolean) => void;
}

export interface EmojiRichInputHandle {
  onInput: (e: Event) => void;
  onPaste: (e: ClipboardEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onCopy: (e: ClipboardEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  /** 在光标处插入表情（选区不在编辑器内则追加到末尾）；面板连插多个时保持聚焦 */
  insertEmoji: (key: string) => void;
  /** 聚焦并把光标移到末尾 */
  focus: () => void;
  /** 读取 DOM→`:[key]` 字符串（导出供回环测试/复制） */
  readDom: (root: HTMLElement) => string;
}

// 零宽空格：img 后的可落点文本节点占位，readDom 会从文本里剥掉，永不进模型。
// 用 fromCodePoint 避免 source 里出现不可见字符 / 转义歧义。
const ZWSP = String.fromCodePoint(0x200b);
const ZWSP_RE = new RegExp(ZWSP, "g");

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

export function useEmojiRichInput(opts: UseEmojiRichInputOptions): EmojiRichInputHandle {
  const { model, editorRef, onModelRendered } = opts;

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
    model.value = readDom(editor);
  }

  function onPaste(e: ClipboardEvent) {
    const editor = editorRef.value;
    const cd = e.clipboardData;
    if (!editor || !cd) return;
    e.preventDefault();
    const text = cd.getData("text/plain");
    if (!text) return;

    const range = getEditableRange(editor);
    range.deleteContents();

    // 按行切，每行经 textToEditableHtml 解析（粘贴的 :[key] 也能变图片），行间插 <br>。
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
    range.insertNode(frag);

    // 光标移到插入内容末尾
    const newRange = document.createRange();
    if (lastNode) newRange.setStartAfter(lastNode);
    else newRange.setStart(range.startContainer, range.startOffset);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);

    model.value = readDom(editor);
  }

  function onKeyDown(e: KeyboardEvent) {
    // Enter 插 <br>（跨浏览器一致，避免 Chrome 的 <div> 包裹）；IME 回车确认不能拦。
    if (e.key !== "Enter" || e.isComposing) return;
    const editor = editorRef.value;
    if (!editor) return;
    e.preventDefault();

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

  // 禁止拖入外部图片（否则 data: base64 img 被 readDom 吐进模型）
  function onDrop(e: DragEvent) {
    e.preventDefault();
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
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

  return { onInput, onPaste, onKeyDown, onCopy, onDrop, onDragOver, insertEmoji, focus, readDom };
}
