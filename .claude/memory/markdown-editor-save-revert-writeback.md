---
name: markdown-editor-save-revert-writeback
description: Markdown 编辑器「保存成功但界面回退」根因是过期的 tiptap 回写覆盖 model;修复=writeMarkdownOut/emitMarkdown 只在富文本模式生效
metadata:
  type: project
---

后台 Markdown 编辑器「输入→保存→content 没保存」的坑(2026-08-31 排查):

**症状**: 纯用 Markdown 编辑器输入,点保存 → 绿色「保存成功」toast,但编辑器(或编辑前内容)回退。new/edit 都复现。注意:此时 PUT 请求体**确实带新内容**、服务器 200、DB **确实存了**,只是编辑器 UI 回退——用户误判为「没保存」。

**根因**: MD 模式下打字只更新 `model`(textarea v-model),**旧 tiptap doc 仍是编辑前内容**(MD 打字不同步进 tiptap)。保存后 `emitMarkdown`(onUpdate 150ms 防抖,`MarkdownEditor.vue` 的 `writeMarkdownOut`)把**过期 tiptap 内容写回 model** → 覆盖成编辑前。onBeforeUnmount 的 `writeMarkdownOut` 同理。

**修复**: ①`emitMarkdown` 加 `if (viewMode.value !== "rich") return;`(md 模式禁止 editor→model 回写);②onBeforeUnmount 改为 `if (suppressEmit.value || viewMode.value !== "rich") return;`(只在富文本冲刷);③flush 的 md 分支同步 `model.value = ta.value` 时也更新 `lastEmitted.value`;④父页 `saveContent`/`savePage` 的 `await flush()` 包进 try/catch(它在 try 之外,flush 一旦抛/挂死会静默中止保存无提示)。

**联动仍正常**: 切换 md↔rich 的 `watch(viewMode)` 里的 `writeMarkdownOut`(rich→md 播种)/`loadMarkdown`(md→rich)是显式意图调用,不受上述 guard 影响;实测 md→rich 能看到 MD 输入内容。

**测试注意**: 复现必须是「全新加载文章页面后的第一次保存」(时灵时不灵),同页第二次可能不复现。相关 [[tiptap-markdown-roundtrip-gotchas]]。
