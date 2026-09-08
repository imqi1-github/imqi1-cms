---
name: tiptap-link-inclusive-schema-field
description: Tiptap Link 的 inclusive 是 schema 静态字段，configure 改不动，必须 extend；用户强原则：链接 mark 只能显式创建，禁止一切自动加链接规则
metadata:
  node_type: memory
  type: project
  originSessionId: b9f11447-8873-46da-a372-eb1eab0409a4
---

后台 MarkdownEditor.vue 链接编辑配置（2026-09-08 全量关闭自动加链接）：

**① inclusive 是 schema 级静态字段，非 options**：`@tiptap/extension-link` 把 `inclusive()` 写死成 `() => this.options.autolink`（默认 true）。`inclusive:true` 语义=光标停在 mark 边界时新输入字符继续继承该 mark → 用户建好链接后光标停链接末尾继续打字，新字全被自动套 link mark，"无法切回普通文本"。`@tiptap/core` 在 `schemaField` 里走 `getExtensionField(extension,"inclusive")` 只读 extension field，**不读 options**，故 `Link.configure({inclusive:false})` 无效。必须 `Link.extend({inclusive:()=>false}).configure({...})`，并 StarterKit `link:false` 关内置避免重复。

**② 已应用链接无"取消"入口**：旧弹窗仅「取消/确定」两按钮，url 留空点确定静默 no-op。修：弹窗加「移除链接」按钮（destructive，仅 `activeFlags.link` 真时显，走 `ed.chain().focus().unsetLink().run()`）；confirmPrompt 里 url 为空也走 unsetLink（确定即取消）；placeholder 提示"留空并确定可移除链接"。Link 扩展自带 commands: setLink/toggleLink/unsetLink（unsetLink 内部 `unsetMark(name,{extendEmptyMarkRange:true})`）。

**③ 用户强原则：链接 mark 只能显式创建（工具栏 / 快捷键 / 弹窗），禁止一切自动加规则**。Link.configure 三个 input/paste rule 全关：
   - `autolink: false` —— 输入 https:// / www. / a.com 等不再自动套 link mark
   - `linkOnPaste: false` —— 粘贴纯 URL 不再自动转链
   - `markdownLinks: false` —— 输入 `[t](u)` 不再自动转链（markdown→富文本的转换仍由 Markdown.setContent 走 markdown-it 完成，**双向保真保留**）
Markdown.configure 同步：
   - `linkify: false` —— markdown-it 不再把裸 URL（`a.com`、`https://x`）识别为链接（这是「富文本 unsetLink 后切回 md 又带 [t](u)」的根因：残留 URL 被 linkify 自动识别为链接，再切回富文本又冒出来）
   - `transformPastedText: false` —— 粘贴纯文本不再当 markdown 解析（避免 `[t](u)`、`**t**` 这类被静默转 mark）
   - `transformCopiedText: true` —— 保留（用户复制富文本到外部 markdown 编辑器时仍按 markdown 序列化；这是显式复制动作而非自动加 mark）

**④ 显式 markdown 输入规则保留**：`**t**` → bold / `*t*` → italic / `# t` → h1 / `- t` → ul / `1. t` → ol / ` ``` t ``` ` → code / `> t` → blockquote —— 这些是用户主动输 markdown 语法触发的，不算"自动加"，与 `[t](u)` → `<a href>` 一起作为**显式 markdown 双向转换**保留。

**⑤ unsetLink 后 markdown 不再带 `[t](u]` 是天然的**：prosemirror-markdown 的 link mark 序列化是 mark 驱动的（`marks.link.open` 写 `[`、`close` 写 `](href)`），mark 不存在就不输出。前置：必须先关掉 linkify（③第二条），否则残留裸 URL 会被 markdown-it 反向识别回 `<a>`。

呼应 [[tiptap-markdown-roundtrip-gotchas]]（同编辑器）；验 Nuxt 改动流程见 [[lint-typecheck-no-root-script]]。