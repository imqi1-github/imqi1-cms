<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
// 空文档占位文字：在首个空段落上加 .is-editor-empty + data-placeholder（见 <style>）
import { Placeholder } from "@tiptap/extension-placeholder";
// @tiptap/extension-table 根入口只有具名导出（无 default），用具名导入；
// 其余 row/cell/header 子路径包仍各自重导出 default，保持默认导入。
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { createDocument, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { CustomContainer } from "./markdown-editor/extensions/CustomContainer";
// StarterKit 自带 CodeBlock 保留 language 但无修改入口；换成 CodeBlockLowlight 变体：
// 既叠加语言输入框 NodeView，又用 lowlight 给编辑态代码块上关键字高亮（往返零差异）
import { CodeBlockLowlightWithLang } from "./markdown-editor/extensions/CodeBlockLowlightWithLang";
// 工具栏抽成子组件，顶部与底部各渲染一份（同一组 props），避免 ~340 行 markup 复制两遍
import EditorToolbar from "./markdown-editor/EditorToolbar.vue";
import { deriveCalloutVariant } from "./markdown-editor/containerMeta";
// Markdown 源码 tab 的光标/选区插入原语（富文本 ⇄ 源码 视图切换用）
import { mdInsertSnippet, mdInsertText, mdPrefixLine, mdWrap } from "./markdown-editor/mdInsert";

import { deriveContainerType, splitMarkdown } from "~/utils/markdownSplit";
import type { PublicAttachmentUploadResponse } from "~/types/apis/attachments";
import type { ToolbarActiveFlags, MarkdownStorage, LinkImagePromptState, TableCreateState } from "~/types/markdown-editor";

const props = defineProps<{
  contentId?: number;
  /** 富文本 ⇄ Markdown 源码 视图模式（由宿主页面的顶层 tab 驱动，默认富文本） */
  viewMode?: "rich" | "md";
}>();

const model = defineModel<string>({ default: "" });

// 视图模式由宿主页面通过 prop 传入（顶层 tab 富文本/Markdown 已上提到页面层）。
// "rich" 为 WYSIWYG(EditorContent)，"md" 为原始 markdown 源码 textarea；两者共用同一个 model
// (markdown 字符串)，切换靠 watch(viewMode) 做「编辑器→源码 冲刷」与「源码→编辑器 重载」。
const viewMode = computed<string>(() => props.viewMode ?? "rich");
const mdTextareaRef = ref<HTMLTextAreaElement | null>(null);
// 富文本内容区（相对定位容器内的绝对滚动层），用于跨视图切换时保留滚动位置
const richScrollRef = ref<HTMLElement | null>(null);

const emit = defineEmits<{
  "attachment-updated": [];
}>();

const toast = useToast();

const uploading = ref(false);

// 粘贴上传占位 image 的 src：1×1 透明 SVG。必须是真实可加载的 data URI，否则浏览器会在
// 盒子上叠一张碎图图标。先前用 "uploading" 哨兵字符串 → 被当相对 URL 请求失败 → 碎图；
// 这里用透明 SVG data URI 让 <img> 加载成功（渲染为透明），盒子化样式靠 alt 前缀
// __uploading_ 在 <style> 里识别（见 img[alt^="__uploading_"]），上传完 alt 改为文件名，
// 样式自动失效。CSP img-src 已放行 data:（见 server/utils/csp.ts）。
const PLACEHOLDER_IMG_SRC =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='1'%20height='1'/%3E";

// 防回环：记录最近一次由编辑器回写出的 markdown，watch(model) 据此跳过回灌
const lastEmitted = ref(model.value);

// —— 纵向可调整大小：底部拖拽手柄调整编辑器高度，持久化到 localStorage ——
// 初始用默认值（SSR 与客户端首帧一致，避免 :style 水合 mismatch）；onMounted 再读 localStorage 覆盖。
const EDITOR_HEIGHT_KEY = "markdown-editor:height";
const EDITOR_HEIGHT_MIN = 320;
const EDITOR_HEIGHT_MAX = 3000;
const EDITOR_HEIGHT_DEFAULT = 720;
const editorHeight = ref(EDITOR_HEIGHT_DEFAULT);
// 底部工具栏仅当编辑器比默认更高时才显示：默认 720 隐藏，>720（即 721+）才出现第二份
const showBottomToolbar = computed(() => editorHeight.value > EDITOR_HEIGHT_DEFAULT);
let resizeStartY = 0;
let resizeStartHeight = 0;

/** 拖拽中：按指针纵向位移改高度，clamp 到 [MIN, MAX]。 */
function onResizeMove(e: PointerEvent) {
  const next = resizeStartHeight + (e.clientY - resizeStartY);
  editorHeight.value = Math.min(EDITOR_HEIGHT_MAX, Math.max(EDITOR_HEIGHT_MIN, next));
}
/** 拖拽结束：解绑监听、恢复全局样式、持久化高度。 */
function endResize() {
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointerup", endResize);
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  localStorage.setItem(EDITOR_HEIGHT_KEY, String(editorHeight.value));
}
/** 手柄 pointerdown：记录起点，绑 window 级 pointermove/up（指针离开手柄也能继续拖）。 */
function startResize(e: PointerEvent) {
  e.preventDefault();
  resizeStartY = e.clientY;
  resizeStartHeight = editorHeight.value;
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", endResize);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "row-resize";
}

onMounted(() => {
  const saved = Number(localStorage.getItem(EDITOR_HEIGHT_KEY));
  if (saved >= EDITOR_HEIGHT_MIN && saved <= EDITOR_HEIGHT_MAX) editorHeight.value = saved;
  // 监听全局键盘事件（Escape 关闭查找面板）
  window.addEventListener("keydown", handleGlobalKeydown);
});
onBeforeUnmount(() => {
  // 拖拽进行中卸载组件时清理监听与全局样式
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointerup", endResize);
  window.removeEventListener("keydown", handleGlobalKeydown);
  // 冲刷 150ms 防抖回写，避免最后一段输入在卸载时丢失
  if (!suppressEmit.value) {
    writeMarkdownOut();
  }
});

// —— 查找和替换 ——
const findReplaceState = ref({
  open: false,
  query: "",
  replace: "",
  matchIndex: 0,
  matchCount: 0,
});

/** 查找匹配的文本范围数组 */
const findMatches = ref<Array<{ from: number; to: number }>>([]);

/** 执行查找：遍历文档找出所有匹配（兼容富文本和 Markdown 模式） */
function doFind(query: string) {
  findMatches.value = [];
  findReplaceState.value.matchIndex = 0;
  findReplaceState.value.matchCount = 0;

  if (!query.trim()) return;

  // Markdown 源码模式：直接操作字符串
  if (viewMode.value === "md") {
    const text = model.value;
    const matches: Array<{ from: number; to: number }> = [];
    let pos = 0;
    while (true) {
      const idx = text.indexOf(query, pos);
      if (idx === -1) break;
      matches.push({ from: idx, to: idx + query.length });
      pos = idx + 1;
    }
    findMatches.value = matches;
    findReplaceState.value.matchCount = matches.length;
    findReplaceState.value.matchIndex = matches.length > 0 ? 1 : 0;
    highlightMdMatch();
    return;
  }

  // 富文本模式：遍历 ProseMirror 文档的文本节点
  const ed = editor.value;
  if (!ed) return;

  const doc = ed.state.doc;
  const matches: Array<{ from: number; to: number }> = [];

  // 使用 descendants 遍历所有节点，包括嵌套的文本节点
  doc.descendants((node, nodePos) => {
    if (node.isText && node.text) {
      const nodeText = node.text;
      let searchPos = 0;
      while (true) {
        const idx = nodeText.indexOf(query, searchPos);
        if (idx === -1) break;
        // 文本节点内的位置偏移量 + 节点在文档中的绝对位置
        const from = nodePos + idx;
        const to = from + query.length;
        matches.push({ from, to });
        searchPos = idx + 1;
      }
    }
    return true; // 继续遍历子节点
  });

  findMatches.value = matches;
  findReplaceState.value.matchCount = matches.length;
  findReplaceState.value.matchIndex = matches.length > 0 ? 1 : 0;
  highlightCurrentMatch();
}

/** 高亮当前匹配并滚动到位置（富文本模式） */
function highlightCurrentMatch() {
  const ed = editor.value;
  if (!ed) return;
  const matches = findMatches.value;
  const idx = findReplaceState.value.matchIndex;

  if (matches.length === 0 || idx === 0) return;

  const match = matches[idx - 1];
  if (match) {
    ed.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    ed.commands.scrollIntoView();
  }
}

/** Markdown 模式高亮和滚动到匹配位置 */
function highlightMdMatch() {
  const ta = mdTextareaRef.value;
  if (!ta) return;
  const matches = findMatches.value;
  const idx = findReplaceState.value.matchIndex;

  if (matches.length === 0 || idx === 0) return;

  const match = matches[idx - 1];
  if (match) {
    ta.focus();
    ta.setSelectionRange(match.from, match.to);
    // 滚动到匹配位置
    const lineHeight = 20;
    const lines = model.value.substring(0, match.from).split("\n").length;
    ta.scrollTop = Math.max(0, (lines - 3) * lineHeight);
  }
}

/** 查找下一个 */
function findNext() {
  if (findMatches.value.length === 0) return;
  const nextIdx = findReplaceState.value.matchIndex >= findMatches.value.length ? 1 : findReplaceState.value.matchIndex + 1;
  findReplaceState.value.matchIndex = nextIdx;
  if (viewMode.value === "md") {
    highlightMdMatch();
  } else {
    highlightCurrentMatch();
  }
}

/** 查找上一个 */
function findPrev() {
  if (findMatches.value.length === 0) return;
  const prevIdx = findReplaceState.value.matchIndex <= 1 ? findMatches.value.length : findReplaceState.value.matchIndex - 1;
  findReplaceState.value.matchIndex = prevIdx;
  if (viewMode.value === "md") {
    highlightMdMatch();
  } else {
    highlightCurrentMatch();
  }
}

/** 替换当前匹配 */
function replaceCurrent() {
  const query = findReplaceState.value.query;
  const replace = findReplaceState.value.replace;
  const idx = findReplaceState.value.matchIndex;
  if (idx === 0 || idx > findMatches.value.length) return;

  // Markdown 源码模式：直接替换字符串
  if (viewMode.value === "md") {
    const text = model.value;
    const match = findMatches.value[idx - 1];
    if (!match) return;
    model.value = text.substring(0, match.from) + replace + text.substring(match.to);
    doFind(query);
    return;
  }

  // 富文本模式：替换选区内容
  const ed = editor.value;
  if (!ed) return;

  const match = findMatches.value[idx - 1];
  if (!match) return;

  ed.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
  ed.chain().focus().insertContent(replace).run();

  doFind(query);
}

/** 替换所有匹配 */
function replaceAll() {
  const query = findReplaceState.value.query;
  const replace = findReplaceState.value.replace;
  if (!query.trim()) return;

  // Markdown 源码模式：直接替换字符串
  if (viewMode.value === "md") {
    model.value = model.value.split(query).join(replace);
    doFind(query);
    return;
  }

  // 富文本模式：遍历所有文本节点替换
  const ed = editor.value;
  if (!ed) return;

  const doc = ed.state.doc;
  let tr = ed.state.tr;

  // 从后往前替换，避免位置偏移问题
  const allMatches: Array<{ from: number; to: number; text: string }> = [];
  doc.descendants((node, nodePos) => {
    if (node.isText && node.text) {
      const nodeText = node.text;
      let searchPos = 0;
      while (true) {
        const idx = nodeText.indexOf(query, searchPos);
        if (idx === -1) break;
        allMatches.push({
          from: nodePos + idx,
          to: nodePos + idx + query.length,
          text: nodeText,
        });
        searchPos = idx + 1;
      }
    }
    return true;
  });

  // 从后往前替换，保持位置正确
  allMatches.sort((a, b) => b.from - a.from);
  for (const m of allMatches) {
    tr = tr.insertText(replace, m.from, m.to);
  }
  ed.view.dispatch(tr);
  doFind(query);
}

/** 打开查找对话框 */
function openFind() {
  findReplaceState.value.open = true;
  if (findReplaceState.value.query) {
    doFind(findReplaceState.value.query);
  }
}

/** 关闭查找对话框 */
function closeFind() {
  findReplaceState.value.open = false;
}

/** 全局键盘事件：处理查找面板的 Escape 和 Enter 键 */
function handleGlobalKeydown(event: KeyboardEvent) {
  // Escape 关闭查找面板
  if (event.key === "Escape" && findReplaceState.value.open) {
    closeFind();
    return;
  }

  // Ctrl+F 打开查找
  if ((event.ctrlKey || event.metaKey) && event.key === "f") {
    event.preventDefault();
    openFind();
    return;
  }
}

// —— 富文本 ⇄ Markdown 统一撤销/重做:单一 markdown 快照栈(两模式共用同一内容历史)——
/** 撤销快照上限,防止长时间编辑/自动重复输入导致内存膨胀(超出后丢弃最旧条目)。 */
const HISTORY_LIMIT = 200;
const contentHistory = ref<string[]>([]);
const contentPointer = ref(-1);

// 工具栏态：撤销/重做可用性(md→快照栈指针;rich→ProseMirror can undo/redo) + 当前激活格式(按钮高亮)
const canUndo = computed(() =>
  viewMode.value === "md" ? contentPointer.value > 0 : (editor.value?.can().undo() ?? false),
);
const canRedo = computed(() =>
  viewMode.value === "md" ? contentPointer.value < contentHistory.value.length - 1 : (editor.value?.can().redo() ?? false),
);
const activeFlags = ref<Partial<ToolbarActiveFlags>>({});
// 表格合并/拆分是否可用（需选区跨多格 / 光标在已合并格）
const canMergeCells = ref(false);
const canSplitCell = ref(false);

/** tiptap-markdown 注入到 editor.storage.markdown 的运行时对象（类型收窄，避免 unsafe 访问）。 */
function getMarkdownStorage(editor: Editor): MarkdownStorage {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown;
}

/** model(markdown 串) → ProseMirror 文档。容器段抽成 customContainer 原子节点，标准段走 markdown-it 解析。 */
function buildDoc(editor: Editor, md: string): ProseMirrorNode {
  const segments = splitMarkdown(md);
  const blocks: ProseMirrorNode[] = [];
  const storage = getMarkdownStorage(editor);

  for (const seg of segments) {
    if (seg.kind === "container") {
      blocks.push(
        editor.schema.nodes.customContainer!.create({
          raw: seg.raw,
        }),
      );
    } else if (seg.text.trim()) {
      // 标准段：markdown → HTML（tiptap-markdown）→ ProseMirror 文档节点。
      // 复用 Tiptap 的 createDocument（与 setContent 同路径：elementFromString 以 text/html
      // 解析 + DOMParser.fromSchema），正确处理块级图片/表格，避免 div.innerHTML 片段解析
      // 把裸 <img> 与相邻 <p> 合并到同一行的差异。
      const html = storage.parser.parse(seg.text);
      const parsed = createDocument(html, editor.schema);
      parsed.forEach((child) => {
        blocks.push(child);
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push(editor.schema.nodes.paragraph!.create());
  }
  return editor.schema.topNodeType.create(null, blocks);
}

/** 把 markdown 加载进编辑器（整段替换，不计入撤销历史）。 */
function loadMarkdown(editor: Editor, md: string) {
  const doc = buildDoc(editor, md);
  const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

/**
 * 上传期间挂起回写：图片粘贴会先插 1×1 透明像素占位节点（alt 带 __uploading_ 标记），
 * 若期间触发防抖回写，占位节点会被中间态写回 model（父组件恰好在窗口内保存就会落库）。
 * 上传结束后由 finally 立即同步一次最终 markdown。
 */
const suppressEmit = ref(false);

/** 立即把当前文档序列化为 markdown 写回 model（同步，供防抖回写与上传结束 flush 共用）。 */
function writeMarkdownOut() {
  const ed = editor.value;
  if (!ed) return;
  const out = getMarkdownStorage(ed).getMarkdown();
  lastEmitted.value = out;
  model.value = out;
}

/** 编辑器 → model（去抖合并连续输入；上传期间挂起）。 */
const emitMarkdown = useDebounceFn(() => {
  if (suppressEmit.value) return;
  writeMarkdownOut();
}, 150);

/**
 * 当前选中的自定义容器对应哪个工具栏按钮 key。atom 容器被 NodeSelection 选中时（点击
 * 容器卡片即选中），点亮对应按钮；多按钮共用一种 type 的（callout 四变体 / repo 双平台 /
 * music 三形态）按 raw 内容精确到具体按钮。未选中容器返回 null。
 */
function activeContainerButtonKey(ed: Editor): string | null {
  const { selection } = ed.state;
  if (!(selection instanceof NodeSelection)) return null;
  const node = selection.node;
  if (node.type.name !== "customContainer") return null;
  const raw = (node.attrs.raw as string) ?? "";
  // 以 raw 为唯一事实来源推导容器类型：不读 attrs.type —— 编辑源码对话框改 raw 后该属性不再刷新，
  // 若当权威读会点亮过期按钮（如把 :::details 改成 :::callout success 后仍亮「折叠」）。与 NodeView 的 meta、序列化路径一致。
  const type = deriveContainerType(raw);
  switch (type) {
    case "live-photo":
      return "livePhoto";
    case "video":
      return "video";
    case "details":
      return "details";
    case "card":
      return "card";
    case "simple-card":
      return "simpleCard";
    case "swiper":
      return "swiper";
    case "waterfall":
      return "waterfall";
    case "callout":
      // 'success' | 'warning' | 'error' | 'info' | null（未识别变体则不点亮）
      return deriveCalloutVariant(raw);
    case "repo":
      return /gitee\.com/i.test(raw) ? "giteeRepo" : "githubRepo";
    case "music": {
      const kind = raw.match(/^:::music\s+(\w+)/)?.[1];
      return kind === "song" ? "musicSong" : kind === "playlist" ? "musicPlaylist" : "musicAuto";
    }
    default:
      return null;
  }
}

/** 刷新工具栏态。 */
function syncState() {
  const ed = editor.value;
  if (!ed) {
    canMergeCells.value = false;
    canSplitCell.value = false;
    activeFlags.value = {};
    return;
  }
  canMergeCells.value = ed.can().mergeCells();
  canSplitCell.value = ed.can().splitCell();
  const containerKey = activeContainerButtonKey(ed);
  activeFlags.value = {
    bold: ed.isActive("bold"),
    italic: ed.isActive("italic"),
    underline: ed.isActive("underline"),
    strike: ed.isActive("strike"),
    code: ed.isActive("code"),
    link: ed.isActive("link"),
    codeBlock: ed.isActive("codeBlock"),
    bulletList: ed.isActive("bulletList"),
    orderedList: ed.isActive("orderedList"),
    blockquote: ed.isActive("blockquote"),
    h1: ed.isActive("heading", { level: 1 }),
    h2: ed.isActive("heading", { level: 2 }),
    h3: ed.isActive("heading", { level: 3 }),
    h4: ed.isActive("heading", { level: 4 }),
    h5: ed.isActive("heading", { level: 5 }),
    h6: ed.isActive("heading", { level: 6 }),
    table: ed.isActive("table"),
    // 光标在代码块内 → 点亮代码块按钮；选中 atom 容器 → 点亮对应容器按钮
    livePhoto: containerKey === "livePhoto",
    video: containerKey === "video",
    details: containerKey === "details",
    success: containerKey === "success",
    warning: containerKey === "warning",
    error: containerKey === "error",
    info: containerKey === "info",
    card: containerKey === "card",
    simpleCard: containerKey === "simpleCard",
    swiper: containerKey === "swiper",
    waterfall: containerKey === "waterfall",
    githubRepo: containerKey === "githubRepo",
    giteeRepo: containerKey === "giteeRepo",
    musicAuto: containerKey === "musicAuto",
    musicSong: containerKey === "musicSong",
    musicPlaylist: containerKey === "musicPlaylist",
  };
}

/** 插入一个自定义容器占位块。 */
function insertContainer(template: string) {
  // 源码模式：把 `:::` 模板当文字插入光标处；否则走富文本自定义容器节点。
  if (viewMode.value === "md") {
    const ta = mdTextareaRef.value;
    if (ta) {
      // 仅在光标后仍有内容时补尾换行（避免文末插入产生多余空段落）；
      // 前导换行恒加 —— 自定义容器是块级元素，须另起一行。
      const trailing = ta.value.slice(ta.selectionEnd).trim().length > 0 ? "\n" : "";
      mdInsertText(ta, model, "\n" + template + trailing);
    }
    return;
  }
  const ed = editor.value;
  if (!ed) return;
  ed.chain()
    .focus()
    .insertContent({
      type: "customContainer",
      attrs: { raw: template },
    })
    .run();
}

// —— 链接 / 图片 URL 输入弹窗（避免原生 prompt）——
const promptState = ref<LinkImagePromptState>({
  open: false,
  mode: "link",
  url: "",
  alt: "",
  text: "",
});

// 弹窗（链接/图片）打开时记下编辑区滚动位置，关闭时还原。
// reka Dialog 关闭会把焦点恢复到触发元素——若触发器在 .ProseMirror 内（点击图片编辑、
// 或编辑器有焦点时弹链接框），焦点回到 PM 会触发浏览器把编辑区滚到光标（文档顶部），
// 看着晕。关闭后用 rAF（滚动发生在同一微任务，rAF 在下次绘制前回调，无可见闪烁）还原
// 原位，覆盖 confirm/cancel/ESC 三种关闭路径。与图片分支里 setImage 的滚动无关——
// 那个也被这里的 rAF 兜住。
const savedScrollTop = ref(0);
watch(
  () => promptState.value.open,
  (open) => {
    const ed = editor.value;
    if (!ed) return;
    const scrollEl = ed.view.dom.closest<HTMLElement>(".overflow-auto");
    if (open) {
      savedScrollTop.value = scrollEl?.scrollTop ?? 0;
    } else if (scrollEl) {
      requestAnimationFrame(() => {
        scrollEl.scrollTop = savedScrollTop.value;
      });
    }
  },
);

function promptLink() {
  let url = "";
  let text = "";
  // 源码模式：链接文字取自 textarea 当前选区（与富文本一致：选中文本则为它上链接）
  if (viewMode.value === "md") {
    const ta = mdTextareaRef.value;
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }
    promptState.value = { open: true, mode: "link", url, text, alt: "" };
    return;
  }
  const ed = editor.value;
  if (ed) {
    if (ed.isActive("link")) {
      // 光标在已有链接内：扩展选区包住整个链接，预填其地址与文字，方便两者都改
      ed.chain().extendMarkRange("link").run();
      const href = ed.getAttributes("link").href;
      if (typeof href === "string") url = href;
      const { from, to } = ed.state.selection;
      text = ed.state.doc.textBetween(from, to, "\n");
    } else {
      const { from, to, empty } = ed.state.selection;
      if (!empty) text = ed.state.doc.textBetween(from, to, "\n");
    }
  }
  promptState.value = { open: true, mode: "link", url, text, alt: "" };
}

function promptImage(prefill?: { src?: string; alt?: string }) {
  promptState.value = {
    open: true,
    mode: "image",
    url: prefill?.src ?? "",
    alt: prefill?.alt ?? "",
    text: "",
  };
}

function confirmPrompt() {
  const ed = editor.value;
  const url = promptState.value.url.trim();
  const alt = promptState.value.alt.trim();
  const mode = promptState.value.mode;
  const text = promptState.value.text.trim();
  promptState.value.open = false;

  // 源码模式：链接/图片拼成 markdown 插到光标处（复用同一弹窗与 URL 校验语义）。
  if (viewMode.value === "md") {
    if (mode === "link") {
      // 留空移除链接：源码里由用户手动删，这里视为取消
      if (!url) return;
      mdInsertText(mdTextareaRef.value, model, `[${text || url}](${url})`);
    } else {
      if (!url) {
        toast.error({ message: "请输入图片地址" });
        return;
      }
      mdInsertText(mdTextareaRef.value, model, `![${alt}](${url})`);
    }
    return;
  }

  const hadSelection = mode === "link" && !ed?.state.selection.empty;
  if (!ed) return;

  if (mode === "link") {
    // 地址留空 = 移除链接：把「确定」当取消键，让已应用的链接可还原成普通文字。
    // 旧实现 url 留空直接静默 return，用户无从下手「取消」一个已存在的链接。
    if (!url) {
      if (hadSelection) ed.chain().focus().unsetLink().run();
      else ed.chain().focus().run();
      return;
    }
    // insertContent 替换当前选区为「文字 + link mark」：已有链接（promptLink 里
    // extendMarkRange 已包住整条）→ 改文字与地址；选中文字 → 给它换上链接；空选区 →
    // 就地插入。文字留空时用 url 兜底显示文本。
    const text = promptState.value.text.trim() || url;
    ed.chain()
      .focus()
      .insertContent({
        type: "text",
        text,
        marks: [{ type: "link", attrs: { href: url } }],
      })
      .run();
  } else {
    // 选区是图片节点（点击图片时 handleClickOn 已设 NodeSelection）→ 改其 src/alt；
    // 否则（工具栏图片按钮）在光标处插入新图片。
    // 关闭弹窗时的滚动统一由上方 watch(promptState.open) 还原，这里不再单独处理。
    if (!url) {
      toast.error({ message: "请输入图片地址" });
      return;
    }
    ed.chain().focus().setImage({ src: url, alt }).run();
  }
}

/** 弹窗里点「移除链接」：清掉选区/光标所在链接 mark 后关弹窗（仅链接模式可见）。 */
function removeLinkFromPrompt() {
  const ed = editor.value;
  promptState.value.open = false;
  if (!ed) return;
  ed.chain().focus().unsetLink().run();
}

// —— 插入表格：弹对话框指定行列数（避免写死 3×3）——
const tableCreateState = ref<TableCreateState>({
  open: false,
  rows: 3,
  cols: 3,
  withHeaderRow: true,
});

function promptTable() {
  // 每次打开重置为默认值
  tableCreateState.value = { open: true, rows: 3, cols: 3, withHeaderRow: true };
}

function confirmTableCreate() {
  const { rows, cols, withHeaderRow } = tableCreateState.value;
  tableCreateState.value.open = false;
  // 钳制到合理区间，防 NaN / 负数 / 超大
  const r = Math.max(1, Math.min(50, Math.trunc(Number(rows) || 3)));
  const c = Math.max(1, Math.min(20, Math.trunc(Number(cols) || 3)));

  // 源码模式：拼一个 markdown 表格插入光标处（表格首行恒作表头）
  if (viewMode.value === "md") {
    const cells = Array.from({ length: c }, (_, i) => `列${i + 1}`);
    const headerRow = `| ${cells.join(" | ")} |`;
    const sepRow = `| ${cells.map(() => "---").join(" | ")} |`;
    const body = Array.from({ length: Math.max(0, r - 1) }, () => `| ${cells.map(() => "").join(" | ")} |`).join("\n");
    const table = `\n${headerRow}\n${sepRow}\n${body}${body ? "\n" : ""}`;
    mdInsertText(mdTextareaRef.value, model, table);
    return;
  }

  const ed = editor.value;
  if (!ed) return;
  ed.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow }).run();
}

// —— 粘贴上传图片：复用 /api/attachments/upload 契约 ——

/** 删除指定 uploadId 的占位 image 节点（上传失败 / 取不到文件对象时清理）。 */
function removePlaceholder(ed: Editor, uploadId: string) {
  let removed = false;
  const tr = ed.state.tr;
  ed.state.doc.descendants((node, pos) => {
    if (removed) return false;
    if (node.type.name === "image" && node.attrs.alt === uploadId) {
      tr.delete(pos, pos + node.nodeSize);
      removed = true;
      return false;
    }
    return true;
  });
  if (removed) ed.view.dispatch(tr);
}

/**
 * 异步上传粘贴的图片：先插占位节点（唯一 alt 标记），逐个上传替换，失败 / 取不到文件
 * 则移除占位。整个流程挂起回写，结束后立即同步最终 markdown。
 */
async function uploadPastedImages(imageItems: DataTransferItem[]) {
  const ed = editor.value;
  if (!ed) return;

  if (!props.contentId) {
    toast.error({
      message: "请先保存文章",
      description: "需要先保存文章后才能粘贴上传图片",
    });
    return;
  }

  uploading.value = true;
  suppressEmit.value = true;
  const uploadIds: string[] = [];

  try {
    // 先逐个插入占位 image 节点（用唯一 alt 标记），再逐个上传替换
    for (let i = 0; i < imageItems.length; i++) {
      const uploadId = `__uploading_${Date.now()}_${i}__`;
      uploadIds.push(uploadId);
      ed.chain()
        .focus()
        .insertContent({ type: "image", attrs: { src: PLACEHOLDER_IMG_SRC, alt: uploadId } })
        .run();
    }

    const csrfToken = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf_token="))
      ?.split("=")[1];

    for (let i = 0; i < imageItems.length; i++) {
      const item = imageItems[i]!;
      const file = item.getAsFile();
      const uploadId = uploadIds[i]!;
      if (!file) {
        // 取不到文件对象（罕见）：清掉已插入的占位，避免孤儿加载盒残留
        removePlaceholder(ed, uploadId);
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      if (csrfToken) formData.append("csrfToken", csrfToken);

      try {
        const res = await $fetch<PublicAttachmentUploadResponse>(
          `/api/attachments/upload?cid=${props.contentId}`,
          { method: "POST", body: formData },
        );

        if (res?.success) {
          // 找到占位节点并替换为真实图片
          let replaced = false;
          const tr = ed.state.tr;
          ed.state.doc.descendants((node, pos) => {
            if (replaced) return false;
            if (node.type.name === "image" && node.attrs.alt === uploadId) {
              tr.setNodeMarkup(pos, undefined, {
                src: res.data.url,
                alt: res.data.name,
                title: null,
              });
              replaced = true;
              return false;
            }
            return true;
          });
          if (replaced) ed.view.dispatch(tr);
          emit("attachment-updated");
          toast.success({ message: "图片上传成功", description: file.name });
        }
      } catch {
        removePlaceholder(ed, uploadId);
        toast.error({ message: "图片上传失败", description: file.name });
      }
    }
  } finally {
    uploading.value = false;
    // 上传期间挂起了防抖回写；这里立即同步一次最终 markdown，避免透明像素占位被中间态写回 model
    suppressEmit.value = false;
    writeMarkdownOut();
  }
}

/**
 * 注意签名是同步的！非图片粘贴同步 return false 放行默认处理；图片粘贴同步
 * preventDefault + return true，异步上传 fire-and-forget。绝不能返回 Promise——
 * ProseMirror 的 someProp 会把 Promise 当 truthy 同步返回，导致 doPaste 跳过默认
 * 粘贴事务，连普通文本粘贴都会失效（只插得进图片）。
 */
function handlePaste(_view: unknown, event: ClipboardEvent): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;
  const imageItems = Array.from(items).filter((it) => it.type.startsWith("image/"));
  if (imageItems.length === 0) return false; // 非图片：放行默认粘贴

  event.preventDefault();
  void uploadPastedImages(imageItems);
  return true;
}

/**
 * 点击编辑器里的图片：选中该图片节点（NodeSelection，让 setImage 走"改属性"而非"插新的"），
 * 并打开弹窗预填当前 src/alt —— 已有图片可直接修改，不必删了重插。
 */
function handleClickOn(
  view: EditorView,
  _pos: number,
  node: ProseMirrorNode,
  nodePos: number,
  event: MouseEvent,
): boolean {
  if (node.type.name !== "image") return false;
  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
  promptImage({
    src: typeof node.attrs.src === "string" ? node.attrs.src : "",
    alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
  });
  return true;
}

/**
 * 富文本模式快捷键：Ctrl/Cmd-K 链接、Ctrl/Cmd+Z/Y 撤销/重做（统一走共享快照栈）。
 * 返回 true 拦截浏览器默认行为；IME 组词期跳过（e.code 在组词时可能仍为按键，须排除）。
 */
function handleKeyDown(_view: EditorView, event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  const combo = mtCombo(event);

  // Tab 键插入 2 个空格
  if (event.key === "Tab") {
    event.preventDefault();
    editor.value?.chain().focus().insertContent("  ").run();
    return true;
  }

  if (combo === "mod-z") {
    event.preventDefault();
    // 富文本:ProseMirror 细粒度撤销(保光标/逐事务),不走快照栈
    editor.value?.commands.undo();
    return true;
  }
  if (combo === "mod-y" || combo === "mod-shift-z") {
    event.preventDefault();
    editor.value?.commands.redo();
    return true;
  }
  if (combo === "mod-k") {
    event.preventDefault();
    promptLink();
    return true;
  }
  // Ctrl+F 查找
  if (combo === "mod-f") {
    event.preventDefault();
    openFind();
    return true;
  }
  return false;
}

// —— Markdown 源码模式：与富文本编辑器的粘贴上传 / Ctrl-K 快捷键对等 ——
// 富文本把 handlePaste/handleKeyDown 注册在 ProseMirror 上，md 模式是裸 textarea，
// 因此这里用原生 @paste / @keydown 补齐图像粘贴上传与链接快捷键，保持一致体验。

/** 源码模式快捷键：与富文本编辑器(Tiptap keymap)对等，落到 markdown 插入原语；IME 组词期跳过。 */
function handleMdKeydown(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;

  // Tab 键插入 2 个空格
  if (event.key === "Tab") {
    event.preventDefault();
    const ta = mdTextareaRef.value;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      ta.value = value.substring(0, start) + "  " + value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      model.value = ta.value;
    }
    return true;
  }

  const action = mdKeyMap[mtCombo(event)];
  if (action) {
    event.preventDefault();
    action();
    return true;
  }
  return false;
}

/** 源码模式粘贴：仅拦图像剪贴板上传，其余放行默认文本粘贴。 */
function handleMdPaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items;
  if (!items) return;
  const imageItems = Array.from(items).filter((it) => it.type.startsWith("image/"));
  if (imageItems.length === 0) return;
  event.preventDefault();
  void uploadPastedImagesToMarkdown(imageItems);
}

/** 源码模式：逐张上传粘贴的图像，把 `![alt](url)` markdown 插入光标处（与富文本上传后插 <img> 对等）。 */
async function uploadPastedImagesToMarkdown(imageItems: DataTransferItem[]) {
  if (!props.contentId) {
    toast.error({
      message: "请先保存文章",
      description: "需要先保存文章后才能粘贴上传图片",
    });
    return;
  }
  uploading.value = true;
  const csrfToken = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="))
    ?.split("=")[1];
  try {
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const formData = new FormData();
      formData.append("file", file);
      if (csrfToken) formData.append("csrfToken", csrfToken);
      try {
        const res = await $fetch<PublicAttachmentUploadResponse>(
          `/api/attachments/upload?cid=${props.contentId}`,
          { method: "POST", body: formData },
        );
        if (res?.success) {
          mdInsertText(mdTextareaRef.value, model, `\n![${res.data.name}](${res.data.url})\n`);
          emit("attachment-updated");
          toast.success({ message: "图片上传成功", description: file.name });
        }
      } catch {
        toast.error({ message: "图片上传失败", description: file.name });
      }
    }
  } finally {
    uploading.value = false;
  }
}


// —— 编辑器实例 ——
const editor = useEditor({
  content: "",
  extensions: [
    // StarterKit v3 已内置 Link + UndoRedo(history)，无需单独引入；
    // codeBlock 关掉，改用下方 CodeBlockLowlightWithLang（语言输入框 + lowlight 高亮）
    StarterKit.configure({
      codeBlock: false,
      // 关掉 StarterKit 内置 Link，改用下方扩展的自定义变体（inclusive: false）
      link: false,
      // 保留 UndoRedo：富文本撤销/重做走 ProseMirror 细粒度(快、保光标)；md 走共享快照栈。
      // 共享栈仍由 watch(model) 记录两侧变更 → md 可跨模式撤富文本的改动。
    }),
    // Link 的 inclusive 是 schema 级静态字段（@tiptap/core 在 schemaField 里
    // 经 getExtensionField(extension, "inclusive") 一次性读取），而 Link 扩展的
    // inclusive() 固定返回 this.options.autolink（默认 true），无视 configure 的传参。
    // inclusive:true 会让光标停在链接末尾时，其后输入的字符自动继承 link mark，
    // 表现为「建好链接后再输入，新文字永远是链接的一部分，无法切回普通文本」。
    // extend 覆盖 inclusive 字段返回 false，链接 mark 不再向后延续，输入流自然回到普通文本。
    Link.extend({
      inclusive: () => false,
    }).configure({
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
    CodeBlockLowlightWithLang,
    // inline:true 让图片作为行内节点落在段落里（与服务端 markdown-it 把独立 ![img](url)
    // 渲染成 <p><img></p> 一致）；若用默认 block，独立图片会成为 doc 的直接子节点，
    // tiptap-markdown 序列化时不加空行，会和相邻段落挤到同一行。
    Image.configure({ inline: true }),
    // 空文档时在首段显示占位文字（仅在整篇为空时，有内容不显）
    Placeholder.configure({ placeholder: "开始写作…" }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    CustomContainer,
    // 选项与服务端 markdown-it({html,linkify,breaks}) 对齐，保证标准部分往返保真
    Markdown.configure({
      html: true,
      linkify: true,
      breaks: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ],
  editorProps: {
    handlePaste,
    handleClickOn,
    handleKeyDown,
    attributes: {
      // prose/prose-invert 是空 class（项目未装 @tailwindcss/typography）；
      // 编辑态排版样式见 <style> 里的 :deep(.ProseMirror) 规则。
      class: "tiptap-content max-w-none",
    },
  },
  onCreate: ({ editor: ed }) => {
    loadMarkdown(ed, model.value);
    // 用编辑器重序列化后的正文作撤销基线(而非输入原文):避免随后 debounced writeMarkdownOut
    // 对规范化敏感内容(表格空白/代码围栏)再记一条,导致"未编辑就被 phantom 快照启用撤销按钮"
    const settled = getMarkdownStorage(ed).getMarkdown();
    lastEmitted.value = settled;
    contentHistory.value = [settled];
    contentPointer.value = 0;
    syncState();
  },
  onUpdate: () => {
    emitMarkdown();
  },
  onTransaction: () => {
    syncState();
  },
});

// —— 富文本 ⇄ Markdown 光标跟随:把 markdown 按当前 doc 顶级块的文本长度比例分布,
//    得到 { mdStart, pmPos, pmEnd }(markdown 起始偏移 ↔ PM 块起止位置)映射,用于切换时定位光标。
//    这是"块级近似":光标落在对应段落/标题/容器段,同段内不精确到字符(因 markdown 有 ** # ::: 等标记符)。
type TopBlockMd = { mdStart: number; pmPos: number; pmEnd: number };
function topBlockMdMap(ed: Editor, md: string): TopBlockMd[] {
  const doc = ed.state.doc;
  const nodeInfos: { node: ProseMirrorNode; pos: number }[] = [];
  const texts: number[] = [];
  doc.forEach((node, pos) => {
    nodeInfos.push({ node, pos });
    // 容器(atom)的 textContent 很短/空,必须用 raw 原文长度估计,否则被严重低估→其后块全部往前挤(漂移)
    const len = node.type.name === "customContainer" ? ((node.attrs.raw as string) ?? "").length : Math.max(1, node.textContent.length);
    texts.push(len);
  });
  const total = texts.reduce((a, b) => a + b, 0) || 1;
  const mdLen = md.length;
  let acc = 0;
  return nodeInfos.map((info, i) => {
    const mdStart = acc;
    acc += Math.round(mdLen * texts[i]! / total);
    const pmPos = info.pos;
    return { mdStart, pmPos, pmEnd: pmPos + info.node.nodeSize - 1 };
  });
}

/** 富文本 PM 光标位置 → markdown 字符偏移:块内偏移用 textBetween(块内纯文本长度,比 PM 字符差更接近 markdown)。 */
function richCursorToMdCursor(ed: Editor, md: string): number {
  const pmPos = ed.state.selection.from;
  const map = topBlockMdMap(ed, md);
  if (map.length === 0) return 0;
  let best = map[0]!;
  for (const m of map) {
    if (m.pmPos <= pmPos) best = m;
    else break;
  }
  const within = pmPos >= best.pmPos ? ed.state.doc.textBetween(best.pmPos, pmPos, "\n").length : 0;
  return Math.max(0, Math.min(md.length, best.mdStart + within));
}

/** markdown 字符偏移 → 富文本 PM 位置(顶级块级近似,块内按字符增量钳制)。 */
function mdCursorToPmPos(ed: Editor, md: string, caret: number): number {
  const map = topBlockMdMap(ed, md);
  if (map.length === 0) return 1;
  let best = map[0]!;
  for (const m of map) {
    if (m.mdStart <= caret) best = m;
    else break;
  }
  const within = Math.max(0, caret - best.mdStart);
  return Math.min(best.pmEnd, best.pmPos + within);
}

// 外部 model 变化（父组件加载新文章 / SPA 导航 / 编辑器或 textarea 回写）：都记入统一快照栈
watch(model, (val) => {
  // 1) 记录快照（undo/redo 自身设值已被 pointer guard 挡住）
  if (val !== contentHistory.value[contentPointer.value]) {
    contentHistory.value = contentHistory.value.slice(0, contentPointer.value + 1);
    contentHistory.value.push(val);
    contentPointer.value = contentHistory.value.length - 1;
    // 超上限丢弃最旧条目(指针随之前移),避免长时间编辑内存膨胀
    if (contentHistory.value.length > HISTORY_LIMIT) {
      const overflow = contentHistory.value.length - HISTORY_LIMIT;
      contentHistory.value.splice(0, overflow);
      contentPointer.value -= overflow;
    }
  }
  // 2) 富文本模式且非聚焦、非最近回写（即外部加载新文档）时重载编辑器，并把撤销基线重置为该内容
  if (viewMode.value === "rich") {
    const ed = editor.value;
    if (!ed) return;
    if (ed.isFocused) return;
    if (val === lastEmitted.value) return;
    loadMarkdown(ed, val);
    lastEmitted.value = val;
    contentHistory.value = [val];
    contentPointer.value = 0;
  }
});

// 切换富文本 ⇄ 源码：先保证 model 与任一视图的 markdown 同步，做到零丢失，并保留各自滚动位置
watch(viewMode, (mode) => {
  if (mode === "md") {
    // 冲刷 150ms 防抖里可能未落库的编辑器改动到 model，再让 textarea 显示
    if (!suppressEmit.value) writeMarkdownOut();
    // 源码模式无「当前激活格式/表格选区」语义，全部清空避免按钮误导
    activeFlags.value = {};
    canMergeCells.value = false;
    canSplitCell.value = false;
    // 光标跟随:把富文本 PM 光标映射成 markdown 偏移(顶级块近似),切源码时光标落在对应段落/标题/容器段
    const ed = editor.value;
    const mdLen = model.value.length;
    const mdCaret = ed ? richCursorToMdCursor(ed, model.value) : 0;
    nextTick(() => {
      const ta = mdTextareaRef.value;
      if (ta) {
        // 光标跟随滚动:先把光标设到对应偏移,再把 textarea 滚动到该处(否则光标在屏外"不出现")
        ta.focus();
        ta.setSelectionRange(mdCaret, mdCaret);
        const max = ta.scrollHeight - ta.clientHeight;
        ta.scrollTop = (mdCaret / Math.max(1, mdLen)) * (max > 0 ? max : 0);
      }
    });
  } else {
    // 把当前 model（textarea 或父级改动）重载进富文本编辑器；写回哨兵避免 watch(model) 二次加载
    const ed = editor.value;
    if (ed) {
      loadMarkdown(ed, model.value);
      lastEmitted.value = model.value;
      syncState();
      // 光标跟随:markdown 偏移 → PM 位置(顶级块近似),切回富文本时光标落在对应块并滚动到可视
      const mdCaret = mdTextareaRef.value?.selectionStart ?? 0;
      const target = mdCursorToPmPos(ed, model.value, mdCaret);
      ed.chain().focus().setTextSelection(target).run();
      ed.chain().focus().scrollIntoView().run();
    }
  }
});

// —— 工具栏动作 ——
// 富文本 ⇄ 源码 分流：md 模式走 markdown 光标插入，rich 模式走原编辑器命令。
const srcWrap = (before: string, after: string) => mdWrap(mdTextareaRef.value, model, before, after);
const srcPrefix = (prefix: string) => mdPrefixLine(mdTextareaRef.value, model, prefix);
const srcInsert = (text: string) => mdInsertText(mdTextareaRef.value, model, text);
const srcSnippet = (text: string, caret: number) => mdInsertSnippet(mdTextareaRef.value, model, text, caret);
/** 源码模式：链接直接插 `[]()` 骨架（光标落 [] 内），不弹窗。 */
const insertLinkMd = () => srcSnippet("[]()", 1);
// 统一撤销/重做：从快照栈取回前一/后一状态，按当前视图写入（md 改 model→textarea；rich 重载编辑器 doc + 同步 model）。
const sharedUndo = () => {
  if (contentPointer.value <= 0) return;
  contentPointer.value--;
  applySnapshot(contentHistory.value[contentPointer.value]!);
};
const sharedRedo = () => {
  if (contentPointer.value >= contentHistory.value.length - 1) return;
  contentPointer.value++;
  applySnapshot(contentHistory.value[contentPointer.value]!);
};

/** 把快照写入当前视图；「光标跳顶/整篇回退」是方案 A 的预期取舍。 */
function applySnapshot(s: string) {
  if (viewMode.value === "md") {
    const ta = mdTextareaRef.value;
    const prevScroll = ta ? ta.scrollTop : 0;
    model.value = s;
    nextTick(() => {
      if (ta) {
        // 保留撤销前的滚动位置(改为更短内容时钳制到末尾),避免跳到文末
        const max = ta.scrollHeight - ta.clientHeight;
        ta.scrollTop = Math.min(prevScroll, max > 0 ? max : 0);
        ta.focus();
      }
    });
  } else {
    const ed = editor.value;
    if (ed) {
      loadMarkdown(ed, s);
      lastEmitted.value = s;
      model.value = s;
    }
  }
}

/** 由 KeyboardEvent 生成规范组合键（如 mod-b / mod-shift-7 / mod-alt-1），用 e.code 对数字/字母稳定。 */
function mtCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const codeMatch = e.code.match(/^(?:Key|Digit)(.+)$/);
  const key = codeMatch ? codeMatch[1]!.toLowerCase() : "";
  return key ? parts.join("-") + "-" + key : "";
}

/** 源码模式快捷键：与富文本编辑器(Tiptap keymap)对等，落到 markdown 插入原语。 */
const mdKeyMap: Record<string, () => void> = {
  "mod-z": sharedUndo,
  "mod-y": sharedRedo,
  "mod-shift-z": sharedRedo,
  "mod-b": () => srcWrap("**", "**"),
  "mod-i": () => srcWrap("*", "*"),
  "mod-u": () => srcWrap("<u>", "</u>"),
  "mod-shift-s": () => srcWrap("~~", "~~"),
  "mod-shift-7": () => srcPrefix("1. "),
  "mod-shift-8": () => srcPrefix("- "),
  "mod-shift-b": () => srcPrefix("> "),
  "mod-e": () => srcWrap("`", "`"),
  "mod-alt-c": () => srcInsert("\n```\n\n```\n"),
  "mod-alt-1": () => srcPrefix("# "),
  "mod-alt-2": () => srcPrefix("## "),
  "mod-alt-3": () => srcPrefix("### "),
  "mod-alt-4": () => srcPrefix("#### "),
  "mod-alt-5": () => srcPrefix("##### "),
  "mod-alt-6": () => srcPrefix("###### "),
  "mod-k": insertLinkMd,
};

const actions = {
  // 撤销/重做：md→共享快照栈(可跨模式撤富文本改动)；rich→ProseMirror 细粒度
  undo: () => (viewMode.value === "md" ? sharedUndo() : editor.value?.commands.undo()),
  redo: () => (viewMode.value === "md" ? sharedRedo() : editor.value?.commands.redo()),
  bold: () => (viewMode.value === "md" ? srcWrap("**", "**") : editor.value?.chain().focus().toggleBold().run()),
  italic: () => (viewMode.value === "md" ? srcWrap("*", "*") : editor.value?.chain().focus().toggleItalic().run()),
  underline: () => (viewMode.value === "md" ? srcWrap("<u>", "</u>") : editor.value?.chain().focus().toggleUnderline().run()),
  strikethrough: () => (viewMode.value === "md" ? srcWrap("~~", "~~") : editor.value?.chain().focus().toggleStrike().run()),
  heading1: () => (viewMode.value === "md" ? srcPrefix("# ") : editor.value?.chain().focus().toggleHeading({ level: 1 }).run()),
  heading2: () => (viewMode.value === "md" ? srcPrefix("## ") : editor.value?.chain().focus().toggleHeading({ level: 2 }).run()),
  heading3: () => (viewMode.value === "md" ? srcPrefix("### ") : editor.value?.chain().focus().toggleHeading({ level: 3 }).run()),
  heading4: () => (viewMode.value === "md" ? srcPrefix("#### ") : editor.value?.chain().focus().toggleHeading({ level: 4 }).run()),
  heading5: () => (viewMode.value === "md" ? srcPrefix("##### ") : editor.value?.chain().focus().toggleHeading({ level: 5 }).run()),
  heading6: () => (viewMode.value === "md" ? srcPrefix("###### ") : editor.value?.chain().focus().toggleHeading({ level: 6 }).run()),
  quote: () => (viewMode.value === "md" ? srcPrefix("> ") : editor.value?.chain().focus().toggleBlockquote().run()),
  code: () => (viewMode.value === "md" ? srcWrap("`", "`") : editor.value?.chain().focus().toggleCode().run()),
  codeBlock: () => (viewMode.value === "md" ? srcInsert("\n```\n\n```\n") : editor.value?.chain().focus().toggleCodeBlock().run()),
  link: () => (viewMode.value === "md" ? insertLinkMd() : promptLink()),
  image: () => promptImage(),
  ul: () => (viewMode.value === "md" ? srcPrefix("- ") : editor.value?.chain().focus().toggleBulletList().run()),
  ol: () => (viewMode.value === "md" ? srcPrefix("1. ") : editor.value?.chain().focus().toggleOrderedList().run()),
  hr: () => (viewMode.value === "md" ? srcInsert("\n---\n") : editor.value?.chain().focus().setHorizontalRule().run()),
  table: () => promptTable(),
  // 表格行列操作（光标须在表格内，由条件工具条触发）
  tableAddRowBefore: () => editor.value?.chain().focus().addRowBefore().run(),
  tableAddRowAfter: () => editor.value?.chain().focus().addRowAfter().run(),
  tableDeleteRow: () => editor.value?.chain().focus().deleteRow().run(),
  tableAddColumnBefore: () => editor.value?.chain().focus().addColumnBefore().run(),
  tableAddColumnAfter: () => editor.value?.chain().focus().addColumnAfter().run(),
  tableDeleteColumn: () => editor.value?.chain().focus().deleteColumn().run(),
  tableToggleHeaderRow: () => editor.value?.chain().focus().toggleHeaderRow().run(),
  tableMergeCells: () => editor.value?.chain().focus().mergeCells().run(),
  tableSplitCell: () => editor.value?.chain().focus().splitCell().run(),
  tableDelete: () => editor.value?.chain().focus().deleteTable().run(),
  // 自定义容器：统一走 insertContainer，模板与原 textarea 工具栏保持一致
  livePhoto: () => insertContainer(":::live-photo https://example.com/live.jpg#live 实况照片说明\n:::"),
  video: () => insertContainer(":::video https://example.com/video.mp4\n:::"),
  details: () => insertContainer(":::details 点击展开标题\n折叠内容\n:::"),
  success: () => insertContainer(":::callout success\n成功提示内容\n:::"),
  warning: () => insertContainer(":::callout warning\n警告提示内容\n:::"),
  error: () => insertContainer(":::callout error\n错误提示内容\n:::"),
  info: () => insertContainer(":::callout info\n信息提示内容\n:::"),
  card: () =>
    insertContainer(
      ":::card https://example.com | 链接标题 | 链接描述（可选） | https://example.com/image.jpg（可选）\n:::",
    ),
  simpleCard: () => insertContainer(":::simple-card https://example.com | 链接标题\n:::"),
  swiper: () =>
    insertContainer(
      ":::swiper\nhttps://example.com/image1.jpg | 图片标题1\nhttps://example.com/image2.jpg | 图片标题2\nhttps://example.com/image3.jpg | 图片标题3\n:::",
    ),
  waterfall: () =>
    insertContainer(
      ":::waterfall\nhttps://example.com/image1.jpg | 图片标题1\nhttps://example.com/image2.jpg | 图片标题2\n:::",
    ),
  githubRepo: () => insertContainer(":::repo https://github.com/username/repository\n:::"),
  giteeRepo: () => insertContainer(":::repo https://gitee.com/username/repository\n:::"),
  musicAuto: () => insertContainer(":::music auto https://music.163.com/#/playlist?id=123456\n:::"),
  musicSong: () => insertContainer(":::music song netease 123456\n:::"),
  musicPlaylist: () => insertContainer(":::music playlist netease 123456\n:::"),
  // 查找和替换
  find: () => openFind(),
};
</script>

<template>
  <div class="markdown-editor flex flex-col" :style="{ height: editorHeight + 'px' }">
    <ClientOnly>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 工具栏（顶部） -->
        <EditorToolbar
          side="top"
          :actions="actions"
          :active-flags="viewMode === 'md' ? {} : activeFlags"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :can-merge-cells="viewMode === 'md' ? false : canMergeCells"
          :can-split-cell="viewMode === 'md' ? false : canSplitCell"
          :uploading="uploading"
        />

        <!-- 编辑区：固定高度下内容超出由各自视图容器内部滚动（不撑高整页）。
             用 relative + absolute inset-0 让富文本/源码各自独占填充，避免 textarea 与父容器
             同时出现滚动条（双滚动条）。 -->
        <div class="relative min-h-0 flex-1 overflow-hidden bg-background">
          <!-- 查找和替换悬浮面板 -->
          <div
            v-if="findReplaceState.open"
            class="absolute top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border bg-background p-2 shadow-lg"
          >
            <Input
              v-model="findReplaceState.query"
              placeholder="查找…"
              class="h-8 w-40 text-sm"
              @input="doFind(findReplaceState.query)"
            />
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ findReplaceState.matchIndex }}/{{ findReplaceState.matchCount }}
            </span>
            <Button variant="ghost" size="icon" class="size-7" title="上一个" @click="findPrev">
              <Icon name="lucide:chevron-up" class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-7" title="下一个" @click="findNext">
              <Icon name="lucide:chevron-down" class="size-4" />
            </Button>
            <div class="mx-0.5 h-5 w-px bg-border" />
            <Input
              v-model="findReplaceState.replace"
              placeholder="替换…"
              class="h-8 w-28 text-sm"
            />
            <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="findReplaceState.matchCount === 0" @click="replaceCurrent">
              替换
            </Button>
            <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="findReplaceState.matchCount === 0" @click="replaceAll">
              全部
            </Button>
            <div class="mx-0.5 h-5 w-px bg-border" />
            <Button variant="ghost" size="icon" class="size-7" title="关闭 (Esc)" @click="closeFind">
              <Icon name="lucide:x" class="size-4" />
            </Button>
          </div>

          <div v-show="viewMode === 'rich'" ref="richScrollRef" class="absolute inset-0 overflow-auto">
            <EditorContent v-if="editor" :editor="editor" />
          </div>
          <textarea
            v-show="viewMode === 'md'"
            ref="mdTextareaRef"
            v-model="model"
            class="absolute inset-0 resize-none overflow-auto bg-background p-4 font-mono text-sm"
            placeholder="开始写作…"
            spellcheck="false"
            @paste="handleMdPaste"
            @keydown="handleMdKeydown"
          />
        </div>
        <!-- 工具栏（底部）：仅编辑器足够高（≥800）时显示，默认高度下只有顶部一份 -->
        <EditorToolbar
          v-if="showBottomToolbar"
          side="bottom"
          :actions="actions"
          :active-flags="viewMode === 'md' ? {} : activeFlags"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :can-merge-cells="viewMode === 'md' ? false : canMergeCells"
          :can-split-cell="viewMode === 'md' ? false : canSplitCell"
          :uploading="uploading"
        />
      </div>

      <template #fallback>
        <textarea
          :value="model"
          disabled
          class="w-full flex-1 resize-none p-4 font-mono text-sm opacity-60"
          placeholder="加载编辑器..."
        />
      </template>
    </ClientOnly>

    <!-- 纵向调整大小手柄：拖动改编辑器高度，记入 localStorage -->
    <div
      class="resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="拖动调整编辑器高度"
      title="拖动调整高度"
      @pointerdown="startResize"
    />

    <!-- 链接 / 图片 URL 输入弹窗 -->
    <Dialog v-model:open="promptState.open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ promptState.mode === "link" ? "插入链接" : "图片" }}</DialogTitle>
          <DialogDescription>
            {{
              promptState.mode === "link"
                ? "输入链接文字与地址；文字留空时用地址作为显示文本"
                : "输入图片地址与说明；点击编辑器里已有的图片可直接修改"
            }}
          </DialogDescription>
        </DialogHeader>
        <Input
          v-if="promptState.mode === 'link'"
          v-model="promptState.text"
          placeholder="链接文字（可选，对应 markdown [文字](地址) 的文字）"
          @keydown.enter="confirmPrompt"
        />
        <Input
          v-model="promptState.url"
          type="url"
          :placeholder="promptState.mode === 'link' ? 'https://example.com（留空并确定可移除链接）' : 'https://example.com/image.jpg'"
          @keydown.enter="confirmPrompt"
        />
        <Input
          v-if="promptState.mode === 'image'"
          v-model="promptState.alt"
          placeholder="图片说明（可选，对应 markdown 的 alt 文本）"
          @keydown.enter="confirmPrompt"
        />
        <DialogFooter>
          <Button
            v-if="promptState.mode === 'link' && activeFlags.link"
            variant="destructive"
            class="mr-auto"
            @click="removeLinkFromPrompt"
          >
            移除链接
          </Button>
          <Button variant="outline" @click="promptState.open = false">取消</Button>
          <Button @click="confirmPrompt">确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 插入表格对话框 -->
    <Dialog v-model:open="tableCreateState.open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>插入表格</DialogTitle>
          <DialogDescription>设置表格的行数与列数</DialogDescription>
        </DialogHeader>
        <div class="flex items-center gap-6">
          <label class="flex items-center gap-2 text-sm">
            行数
            <Input
              :model-value="tableCreateState.rows"
              type="number"
              min="1"
              max="50"
              class="w-20"
              @update:model-value="(v: string | number) => (tableCreateState.rows = Number(v) || 0)"
            />
          </label>
          <label class="flex items-center gap-2 text-sm">
            列数
            <Input
              :model-value="tableCreateState.cols"
              type="number"
              min="1"
              max="20"
              class="w-20"
              @update:model-value="(v: string | number) => (tableCreateState.cols = Number(v) || 0)"
            />
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            :checked="tableCreateState.withHeaderRow"
            class="size-4 rounded border-input"
            @change="tableCreateState.withHeaderRow = ($event.target as HTMLInputElement).checked"
          >
          首行作为表头
        </label>
        <DialogFooter>
          <Button variant="outline" @click="tableCreateState.open = false">取消</Button>
          <Button @click="confirmTableCreate">插入</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* 工具栏竖向分隔线：Separator 组件内置 data-[orientation=vertical]:h-full（特异性 0,2,0）
   会压过工具栏传入的 h-5/h-6（0,1,0），把分隔线撑成容器全高，在 flex-wrap 多行工具栏里
   撑破布局（scrollH>clientH → 第二行溢出）。这里用更高特异性钉回按钮行的合理高度。 */
.markdown-editor :deep([data-slot="separator"][data-orientation="vertical"]) {
  height: 1.5rem;
}

.markdown-editor :deep(.tiptap-content.ProseMirror) {
  /* JetBrains Mono 程序连字会把 ":::" / "//" 渲染成合成字形（看着像少字符）。
     markdown 语法里的冒号/斜杠必须按字面显示，禁用连字。 */
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0, "calt" 0, "clig" 0, "dlig" 0;

  min-height: 400px;
  padding: 1rem 1.25rem;
  outline: none;
  line-height: 1.8;
  word-wrap: break-word;
}

/* 空文档占位：Tiptap Placeholder 在首个空段落上加 class="is-empty is-editor-empty"
   与 data-placeholder 属性，用 ::before 渲染文字。height:0 + float:left 让占位不占行高。 */
.markdown-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: rgb(148 163 184);
  pointer-events: none;
  float: left;
  height: 0;
}
.dark .markdown-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: rgb(100 116 139);
}

/* 兄弟块级元素之间留一行间距（复刻前台 .markdown-body 的间距节奏） */
.markdown-editor :deep(.ProseMirror > * + *) {
  margin-top: 1em;
}

/* 标题：忠于前台字号层级 */
.markdown-editor :deep(.ProseMirror h1),
.markdown-editor :deep(.ProseMirror h2),
.markdown-editor :deep(.ProseMirror h3),
.markdown-editor :deep(.ProseMirror h4),
.markdown-editor :deep(.ProseMirror h5),
.markdown-editor :deep(.ProseMirror h6) {
  font-weight: 700;
  line-height: 1.3;
}
.markdown-editor :deep(.ProseMirror h1) {
  font-size: 2em;
  padding-bottom: 0.3em;
}
.markdown-editor :deep(.ProseMirror h2) {
  font-size: 1.5em;
  padding-bottom: 0.3em;
}
.markdown-editor :deep(.ProseMirror h3) {
  font-size: 1.25em;
}
.markdown-editor :deep(.ProseMirror h4) {
  font-size: 1em;
}

/* 链接 */
.markdown-editor :deep(.ProseMirror a) {
  color: rgb(37 99 235);
  text-decoration: none;
}
.markdown-editor :deep(.ProseMirror a:hover) {
  text-decoration: underline;
}
.dark .markdown-editor :deep(.ProseMirror a) {
  color: rgb(96 165 250);
}

/* 列表：恢复项目符号 / 序号（preflight 清掉了） */
.markdown-editor :deep(.ProseMirror ul),
.markdown-editor :deep(.ProseMirror ol) {
  padding-left: 2em;
}
.markdown-editor :deep(.ProseMirror ul) {
  list-style-type: disc;
}
.markdown-editor :deep(.ProseMirror ol) {
  list-style-type: decimal;
}
.markdown-editor :deep(.ProseMirror li) {
  display: list-item;
}
/* Tiptap 的 ListItem/单元格内容包了一层 <p>，去掉它的外边距避免双重间距 */
.markdown-editor :deep(.ProseMirror li > p),
.markdown-editor :deep(.ProseMirror table p) {
  margin: 0;
}

/* 引用块 */
.markdown-editor :deep(.ProseMirror blockquote) {
  padding: 0.5em 1em;
  border-left: 4px solid rgb(37 99 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
}
.dark .markdown-editor :deep(.ProseMirror blockquote) {
  background: rgb(31 41 55);
  color: rgb(156 163 175);
}

/* 行内代码 */
.markdown-editor :deep(.ProseMirror code) {
  padding: 0.2em 0.4em;
  font-size: 85%;
  background: rgb(243 244 246);
  border-radius: 3px;
}
.dark .markdown-editor :deep(.ProseMirror code) {
  background: rgb(55 65 81);
}

/* 代码块：lowlight（highlight.js）装饰着色，配色复用前台 Shiki Islands 主题，
   编辑态与前台渲染观感一致。装饰是 Decoration.inline，不进文档模型，往返零差异。 */
.markdown-editor :deep(.ProseMirror pre) {
  padding: 0.75em 1em;
  background: rgb(243 244 246);
  border-radius: 6px;
  overflow-x: auto;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.875em;
}
.markdown-editor :deep(.ProseMirror pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
  /* 非装饰文本（运算符/标点/空白/普通变量）的基色 */
  color: #1f2328;
}
.dark .markdown-editor :deep(.ProseMirror pre code) {
  color: #bcbec4;
  /* 块级代码背景须透明（背景交给 pre）；否则被暗色行内代码 rule `.dark .ProseMirror code`(rgb 55 65 81)
     以更高特异性覆盖，代码块每个字符都带灰底 */
  background: none;
}
.dark .markdown-editor :deep(.ProseMirror pre) {
  background: rgb(31 41 55);
}

/* lowlight token 配色 —— 亮色（对齐 Islands Light） */
.markdown-editor :deep(.ProseMirror pre .hljs-comment),
.markdown-editor :deep(.ProseMirror pre .hljs-quote) {
  color: #8c8c8c;
  font-style: italic;
}
.markdown-editor :deep(.ProseMirror pre .hljs-keyword),
.markdown-editor :deep(.ProseMirror pre .hljs-selector-tag),
.markdown-editor :deep(.ProseMirror pre .hljs-literal),
.markdown-editor :deep(.ProseMirror pre .hljs-doctag),
.markdown-editor :deep(.ProseMirror pre .hljs-meta) {
  color: #0033b3;
}
.markdown-editor :deep(.ProseMirror pre .hljs-number) {
  color: #1750eb;
}
.markdown-editor :deep(.ProseMirror pre .hljs-string) {
  color: #067d17;
}
.markdown-editor :deep(.ProseMirror pre .hljs-regexp) {
  color: #264eff;
}
.markdown-editor :deep(.ProseMirror pre .hljs-title),
.markdown-editor :deep(.ProseMirror pre .hljs-section) {
  color: #00627a;
}
.markdown-editor :deep(.ProseMirror pre .hljs-type),
.markdown-editor :deep(.ProseMirror pre .hljs-built_in) {
  color: #336ecc;
}
.markdown-editor :deep(.ProseMirror pre .hljs-attr),
.markdown-editor :deep(.ProseMirror pre .hljs-attribute),
.markdown-editor :deep(.ProseMirror pre .hljs-property),
.markdown-editor :deep(.ProseMirror pre .hljs-symbol),
.markdown-editor :deep(.ProseMirror pre .hljs-bullet),
.markdown-editor :deep(.ProseMirror pre .hljs-template-variable) {
  color: #871094;
}
.markdown-editor :deep(.ProseMirror pre .hljs-tag),
.markdown-editor :deep(.ProseMirror pre .hljs-name),
.markdown-editor :deep(.ProseMirror pre .hljs-selector-id) {
  color: #000080;
}
.markdown-editor :deep(.ProseMirror pre .hljs-addition) {
  color: #067d17;
}
.markdown-editor :deep(.ProseMirror pre .hljs-deletion) {
  color: #de1b2e;
}
.markdown-editor :deep(.ProseMirror pre .hljs-emphasis) {
  font-style: italic;
}
.markdown-editor :deep(.ProseMirror pre .hljs-strong) {
  font-weight: 700;
}

/* lowlight token 配色 —— 暗色（对齐 Islands Dark） */
.dark .markdown-editor :deep(.ProseMirror pre .hljs-comment),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-quote) {
  color: #7a7e85;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-keyword),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-selector-tag),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-literal),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-doctag),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-meta) {
  color: #cf8e6d;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-number) {
  color: #2aacb8;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-string) {
  color: #6aab73;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-regexp) {
  color: #42c3d4;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-title),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-section) {
  color: #56a8f5;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-type),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-built_in) {
  color: #16baac;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-attr),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-attribute),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-property),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-symbol),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-bullet),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-template-variable) {
  color: #c77dbb;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-tag),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-name),
.dark .markdown-editor :deep(.ProseMirror pre .hljs-selector-id) {
  color: #d5b778;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-addition) {
  color: #6aab73;
}
.dark .markdown-editor :deep(.ProseMirror pre .hljs-deletion) {
  color: #ffa198;
}

/* 表格 */
.markdown-editor :deep(.ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
}
.markdown-editor :deep(.ProseMirror table th),
.markdown-editor :deep(.ProseMirror table td) {
  padding: 0.5em 1em;
  border: 1px solid rgb(229 231 235);
}
.dark .markdown-editor :deep(.ProseMirror table th),
.dark .markdown-editor :deep(.ProseMirror table td) {
  border-color: rgb(55 65 81);
}
.markdown-editor :deep(.ProseMirror table th) {
  background: rgb(249 250 251);
  font-weight: 600;
}
.dark .markdown-editor :deep(.ProseMirror table th) {
  background: rgb(31 41 55);
}
/* Tiptap 选中单元格的高亮 */
.markdown-editor :deep(.ProseMirror .selectedCell) {
  background: rgb(219 234 254);
}
.dark .markdown-editor :deep(.ProseMirror .selectedCell) {
  background: rgb(30 58 95);
}

/* 分割线 */
.markdown-editor :deep(.ProseMirror hr) {
  margin: 2em 0;
  border: none;
  border-top: 1px solid rgb(229 231 235);
}
.dark .markdown-editor :deep(.ProseMirror hr) {
  border-top-color: rgb(55 65 81);
}

/* 图片：自适应宽度（编辑态不开 zoom-in 光标） */
.markdown-editor :deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

/* 粘贴图片上传占位：alt 以 __uploading_ 开头识别（上传完 alt 改为文件名，样式自动失效）。
   src 是 1×1 透明 SVG data URI（非 http URL），盒子化 + 虚线描边 + shimmer 动画提示「上传中」，
   替代先前 src=uploading 渲染出的碎图。中性半透明色在亮/暗态都可读。
   注：<img> 是替换元素无法挂伪元素，旋转 spinner 又依赖子元素或不可靠的背景 SVG 动画
   （Chrome 不跑），故用 shimmer（background-position 动画，全浏览器可靠）。 */
.markdown-editor :deep(.ProseMirror img[alt^="__uploading_"]) {
  display: block;
  width: 100%;
  height: 180px;
  border-radius: 0.5rem;
  border: 1px dashed rgb(148 163 184 / 0.6);
  background: linear-gradient(
    100deg,
    rgb(148 163 184 / 0.12) 30%,
    rgb(148 163 184 / 0.32) 50%,
    rgb(148 163 184 / 0.12) 70%
  );
  background-size: 200% 100%;
  animation: markdown-editor-upload-shimmer 1.3s ease-in-out infinite;
}
@keyframes markdown-editor-upload-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 图片段落底部异常大间隙的根因：Tailwind preflight 给 img 设了 display:block，导致同段的
   .ProseMirror-separator（0 宽 inline 占位 img）被挤到图片下方独占一整行行高（line-height 28.8px）。
   难点：prosemirror-view 注入了 `img.ProseMirror-separator { display: inline !important }`，
   必须用 !important + 更高特异性（scoped 0,5,1 > 其 0,1,1）才能压过。trailingBreak 同理处理。
   两者都不承担视觉（仅光标/选区定位），display:none 消除间隙；限定 :has(> img)，
   纯文字/空段落的同类占位不受影响。 */
.markdown-editor :deep(.ProseMirror p:has(> img) .ProseMirror-separator),
.markdown-editor :deep(.ProseMirror p:has(> img) .ProseMirror-trailingBreak) {
  display: none !important;
}

/* 容器占位块自成卡片，不继承上面的间距节奏 */
.markdown-editor :deep(.ProseMirror .not-prose) {
  margin-top: 0.75rem;
  margin-bottom: 0.75rem;
}

/* 底部纵向拖拽手柄：拖动调整编辑器高度（JS 见 startResize） */
.markdown-editor .resize-handle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 12px;
  cursor: row-resize;
  user-select: none;
  touch-action: none;
  background: rgb(241 245 249);
  border-top: 1px solid rgb(226 232 240);
  transition: background 0.15s ease;
}
.markdown-editor .resize-handle::before {
  content: "";
  width: 36px;
  height: 4px;
  border-radius: 9999px;
  background: rgb(148 163 184);
  transition: background 0.15s ease;
}
.markdown-editor .resize-handle:hover,
.markdown-editor .resize-handle:active {
  background: rgb(226 232 240);
}
.markdown-editor .resize-handle:hover::before,
.markdown-editor .resize-handle:active::before {
  background: rgb(100 116 139);
}
.dark .markdown-editor .resize-handle {
  background: rgb(30 41 59);
  border-top-color: rgb(51 65 85);
}
.dark .markdown-editor .resize-handle::before {
  background: rgb(100 116 139);
}
.dark .markdown-editor .resize-handle:hover,
.dark .markdown-editor .resize-handle:active {
  background: rgb(51 65 85);
}
.dark .markdown-editor .resize-handle:hover::before,
.dark .markdown-editor .resize-handle:active::before {
  background: rgb(148 163 184);
}
</style>
