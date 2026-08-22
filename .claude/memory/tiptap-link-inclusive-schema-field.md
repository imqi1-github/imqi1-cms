---
name: tiptap-link-inclusive-schema-field
description: Tiptap Link 的 inclusive 是 schema 静态字段，configure 改不动，必须 extend；inclusive:true 致链接末尾输入延续 mark
metadata: 
  node_type: memory
  type: project
  originSessionId: b9f11447-8873-46da-a372-eb1eab0409a3
---

后台 MarkdownEditor.vue 链接编辑两坑（2026-08-12 修）：

**① inclusive 是 schema 级静态字段，非 options**：`@tiptap/extension-link` 把 `inclusive()` 写死成 `() => this.options.autolink`（默认 true）。`inclusive:true` 语义=光标停在 mark 边界时新输入字符继续继承该 mark → 用户建好链接后光标停链接末尾继续打字，新字全被自动套 link mark，"无法切回普通文本"。`@tiptap/core` 在 `schemaField` 里走 `getExtensionField(extension,"inclusive")` 只读 extension field，**不读 options**，故 `Link.configure({inclusive:false})` 无效。必须 `Link.extend({inclusive:()=>false}).configure({...})`，并 StarterKit `link:false` 关内置避免重复。

**② 已应用链接无"取消"入口**：旧弹窗仅「取消/确定」两按钮，url 留空点确定静默 no-op。修：弹窗加「移除链接」按钮（destructive，仅 `activeFlags.link` 真时显，走 `ed.chain().focus().unsetLink().run()`）；confirmPrompt 里 url 为空也走 unsetLink（确定即取消）；placeholder 提示"留空并确定可移除链接"。Link 扩展自带 commands: setLink/toggleLink/unsetLink（unsetLink 内部 `unsetMark(name,{extendEmptyMarkRange:true})`）。

呼应 [[tiptap-markdown-roundtrip-gotchas]]（同编辑器）；验 Nuxt 改动流程见 [[lint-typecheck-no-root-script]]。
