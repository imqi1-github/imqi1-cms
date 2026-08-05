<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
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
// StarterKit 自带 CodeBlock 保留 language 但无修改入口，这里换成带语言选择 NodeView 的版本
import { CodeBlockWithLang } from "./markdown-editor/extensions/CodeBlockWithLang";
// 工具栏抽成子组件，顶部与底部各渲染一份（同一组 props），避免 ~340 行 markup 复制两遍
import EditorToolbar from "./markdown-editor/EditorToolbar.vue";

import { deriveContainerType, splitMarkdown } from "~/utils/markdownSplit";
import type { PublicAttachmentUploadResponse } from "~/types/apis/attachments";

const props = defineProps<{
  contentId?: number;
}>();

const model = defineModel<string>({ default: "" });

const emit = defineEmits<{
  "attachment-updated": [];
}>();

const toast = useToast();

const uploading = ref(false);

// 防回环：记录最近一次由编辑器回写出的 markdown，watch(model) 据此跳过回灌
const lastEmitted = ref(model.value);

// 工具栏态：撤销/重做可用性 + 当前激活的格式（用于按钮高亮），随事务刷新
const canUndo = ref(false);
const canRedo = ref(false);
const activeFlags = ref<Record<string, boolean>>({});
// 表格合并/拆分是否可用（需选区跨多格 / 光标在已合并格）
const canMergeCells = ref(false);
const canSplitCell = ref(false);

/** tiptap-markdown 注入到 editor.storage.markdown 的运行时对象（类型收窄，避免 unsafe 访问）。 */
interface MarkdownStorage {
  getMarkdown: () => string;
  parser: { parse: (content: string, opts?: { inline?: boolean }) => string };
}

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
          type: deriveContainerType(seg.raw) ?? "",
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
 * 上传期间挂起回写：图片粘贴会先插 src=uploading 占位节点，若期间触发防抖回写，
 * 占位 URL 会被中间态写回 model（父组件恰好在窗口内保存就会落库）。上传结束后
 * 由 finally 立即同步一次最终 markdown。
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

/** 刷新工具栏态。 */
function syncState() {
  const ed = editor.value;
  if (!ed) {
    canUndo.value = false;
    canRedo.value = false;
    canMergeCells.value = false;
    canSplitCell.value = false;
    activeFlags.value = {};
    return;
  }
  canUndo.value = ed.can().undo();
  canRedo.value = ed.can().redo();
  canMergeCells.value = ed.can().mergeCells();
  canSplitCell.value = ed.can().splitCell();
  activeFlags.value = {
    bold: ed.isActive("bold"),
    italic: ed.isActive("italic"),
    strike: ed.isActive("strike"),
    code: ed.isActive("code"),
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
  };
}

/** 插入一个自定义容器占位块。 */
function insertContainer(template: string) {
  const ed = editor.value;
  if (!ed) return;
  ed.chain()
    .focus()
    .insertContent({
      type: "customContainer",
      attrs: { raw: template, type: deriveContainerType(template) ?? "" },
    })
    .run();
}

// —— 链接 / 图片 URL 输入弹窗（避免原生 prompt）——
const promptState = ref<{ open: boolean; mode: "link" | "image"; url: string; alt: string }>({
  open: false,
  mode: "link",
  url: "",
  alt: "",
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
  const ed = editor.value;
  let current = "";
  if (ed && ed.isActive("link")) {
    const href = ed.getAttributes("link").href;
    if (typeof href === "string") current = href;
  }
  promptState.value = { open: true, mode: "link", url: current, alt: "" };
}

function promptImage(prefill?: { src?: string; alt?: string }) {
  promptState.value = {
    open: true,
    mode: "image",
    url: prefill?.src ?? "",
    alt: prefill?.alt ?? "",
  };
}

function confirmPrompt() {
  const ed = editor.value;
  const url = promptState.value.url.trim();
  const alt = promptState.value.alt.trim();
  const mode = promptState.value.mode;
  promptState.value.open = false;
  if (!ed || !url) return;
  if (mode === "link") {
    const { empty } = ed.state.selection;
    if (empty) {
      ed.chain()
        .focus()
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  } else {
    // 选区是图片节点（点击图片时 handleClickOn 已设 NodeSelection）→ 改其 src/alt；
    // 否则（工具栏图片按钮）在光标处插入新图片。
    // 关闭弹窗时的滚动统一由上方 watch(promptState.open) 还原，这里不再单独处理。
    ed.chain().focus().setImage({ src: url, alt }).run();
  }
}

// —— 插入表格：弹对话框指定行列数（避免写死 3×3）——
const tableCreateState = ref<{ open: boolean; rows: number; cols: number; withHeaderRow: boolean }>({
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
  const ed = editor.value;
  const { rows, cols, withHeaderRow } = tableCreateState.value;
  tableCreateState.value.open = false;
  if (!ed) return;
  // 钳制到合理区间，防 NaN / 负数 / 超大
  const r = Math.max(1, Math.min(50, Math.trunc(Number(rows) || 3)));
  const c = Math.max(1, Math.min(20, Math.trunc(Number(cols) || 3)));
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
        .insertContent({ type: "image", attrs: { src: "uploading", alt: uploadId } })
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
        // 取不到文件对象（罕见）：清掉已插入的占位，避免孤儿 src=uploading 坏图残留
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
    // 上传期间挂起了防抖回写；这里立即同步一次最终 markdown，避免占位 src=uploading 被中间态写回 model
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
 * Ctrl/Cmd-K：插入 / 编辑链接（写作工具的肌肉记忆，工具栏按钮之外的快捷入口）。
 * 返回 true 拦截浏览器默认行为（部分浏览器 Ctrl-K 会聚焦地址栏 / 搜索栏）。
 * 仅响应 k（含 Shift/CapsLock 大写），IME 组词期 event.key 为 "Process" 自然不匹配。
 */
function handleKeyDown(_view: EditorView, event: KeyboardEvent): boolean {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    promptLink();
    return true;
  }
  return false;
}

// —— 编辑器实例 ——
const editor = useEditor({
  content: "",
  extensions: [
    // StarterKit v3 已内置 Link + UndoRedo(history)，无需单独引入；
    // codeBlock 关掉，改用下方 CodeBlockWithLang（带语言选择 NodeView）
    StarterKit.configure({
      codeBlock: false,
      link: {
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      },
    }),
    CodeBlockWithLang,
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
    lastEmitted.value = model.value;
    syncState();
  },
  onUpdate: () => {
    emitMarkdown();
  },
  onTransaction: () => {
    syncState();
  },
});

// 外部 model 变化（父组件加载新文章 / SPA 导航）：聚焦中或与最近回写一致时跳过，防回环
watch(model, (val) => {
  const ed = editor.value;
  if (!ed) return;
  if (ed.isFocused) return;
  if (val === lastEmitted.value) return;
  loadMarkdown(ed, val);
  lastEmitted.value = val;
});

// —— 工具栏动作 ——
const actions = {
  undo: () => editor.value?.commands.undo(),
  redo: () => editor.value?.commands.redo(),
  bold: () => editor.value?.chain().focus().toggleBold().run(),
  italic: () => editor.value?.chain().focus().toggleItalic().run(),
  strikethrough: () => editor.value?.chain().focus().toggleStrike().run(),
  heading1: () => editor.value?.chain().focus().toggleHeading({ level: 1 }).run(),
  heading2: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run(),
  heading3: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run(),
  heading4: () => editor.value?.chain().focus().toggleHeading({ level: 4 }).run(),
  heading5: () => editor.value?.chain().focus().toggleHeading({ level: 5 }).run(),
  heading6: () => editor.value?.chain().focus().toggleHeading({ level: 6 }).run(),
  quote: () => editor.value?.chain().focus().toggleBlockquote().run(),
  code: () => editor.value?.chain().focus().toggleCode().run(),
  codeBlock: () => editor.value?.chain().focus().toggleCodeBlock().run(),
  link: () => promptLink(),
  image: () => promptImage(),
  ul: () => editor.value?.chain().focus().toggleBulletList().run(),
  ol: () => editor.value?.chain().focus().toggleOrderedList().run(),
  hr: () => editor.value?.chain().focus().setHorizontalRule().run(),
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
};
</script>

<template>
  <div class="markdown-editor flex h-180 flex-col">
    <ClientOnly>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- 工具栏（顶部） -->
        <EditorToolbar
          side="top"
          :actions="actions"
          :active-flags="activeFlags"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :can-merge-cells="canMergeCells"
          :can-split-cell="canSplitCell"
          :uploading="uploading"
        />

        <!-- 编辑区：固定高度下内容超出由此容器内部滚动（不撑高整页） -->
        <div class="min-h-0 flex-1 overflow-auto bg-background">
          <EditorContent v-if="editor" :editor="editor" />
        </div>
        <!-- 工具栏（底部）：与顶部同一份组件/props，光标进表格时两份同步切到表格操作 -->
        <EditorToolbar
          side="bottom"
          :actions="actions"
          :active-flags="activeFlags"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :can-merge-cells="canMergeCells"
          :can-split-cell="canSplitCell"
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

    <!-- 链接 / 图片 URL 输入弹窗 -->
    <Dialog v-model:open="promptState.open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ promptState.mode === "link" ? "插入链接" : "图片" }}</DialogTitle>
          <DialogDescription>
            {{
              promptState.mode === "link"
                ? "输入链接地址（选中文本会被设为链接）"
                : "输入图片地址与说明；点击编辑器里已有的图片可直接修改"
            }}
          </DialogDescription>
        </DialogHeader>
        <Input
          v-model="promptState.url"
          type="url"
          :placeholder="promptState.mode === 'link' ? 'https://example.com' : 'https://example.com/image.jpg'"
          @keydown.enter="confirmPrompt"
        />
        <Input
          v-if="promptState.mode === 'image'"
          v-model="promptState.alt"
          placeholder="图片说明（可选，对应 markdown 的 alt 文本）"
          @keydown.enter="confirmPrompt"
        />
        <DialogFooter>
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

/* 代码块：编辑器内无 Shiki 高亮，给统一的等宽底色块 */
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
}
.dark .markdown-editor :deep(.ProseMirror pre) {
  background: rgb(31 41 55);
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
</style>
