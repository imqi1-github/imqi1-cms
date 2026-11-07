---
name: markdown-editor-fixed-height-internal-scroll
description: MarkdownEditor 根固定高度(flex-col + editorHeight 拖拽持久化)+编辑区 flex-1 overflow-auto 内部滚动；工具栏在 flex 头部天然固定无需 sticky/fixed；表格上下文 v-if 整体切换工具栏内容；命令 .focus() 默认 scrollIntoView 会滚走编辑区，须保存/恢复 scrollTop
metadata:
  type: project
---

`app/components/MarkdownEditor.vue` 的布局与工具栏方案：

## 根固定高度 + 编辑区内部滚动

根 div 是 `flex flex-col` + `:style="{ height: editorHeight + 'px' }"`（**不是** `h-[calc(100vh-200px)]`）：底部拖拽手柄调整高度并持久化 **localStorage**（`EDITOR_HEIGHT_KEY="markdown-editor:height"`，默认 720 / min 320 / max 3000；SSR 与客户端首帧取默认值避免 `:style` 水合 mismatch，`onMounted` 再读 localStorage 覆盖）。内层 `flex min-h-0 flex-1 flex-col`，编辑区 `min-h-0 flex-1 overflow-auto`。长内容在编辑区**内部滚动**（`scrollTop` 真实变化），整页不再被撑高。

⚠️ 早期 `h-full` 高度链断（两个调用方 `edit.vue` 外层 `Card.overflow-hidden > CardContent.p-0 > ...` 全无固定高度）⇒ 编辑区 `overflow-auto` 不触发、`scrollTop` 恒 0，滚动跑到 window 层。

固定高度 offset `200px` ≈ admin header(h-14=56) + main p-6(24) + TabsList(~40) + TabsContent mt-6(24) + border。

## 工具栏在 flex 头部天然固定，无需 sticky/fixed

工具栏是编辑器根 flex 的第一子、编辑区是第二子；只有编辑区 `overflow-auto` 滚 ⇒ 工具栏永远钉在编辑器顶。**不要 `position: sticky`**（会被 `Card.overflow-hidden` 祖先截成相对它的无效 sticky——overflow:hidden 是 scroll container 但自身不滚），更不要 fixed + 视口坐标 + scroll/resize 监听。

**三个叠加坑（缺一就「下一行溢出」）**：

1. 工具栏 div 必须带 `shrink-0`（`flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 p-2`），否则在 flex-col 父里被编辑区 `flex-1` 压缩（clientH<scrollH），第二行按钮被挤出工具栏叠到编辑区。
2. 工具栏 Separator（vertical）受 reka 组件内置 `data-[orientation=vertical]:h-full` 控制，该规则特异性 **0,2,0**（class+attr）压过传入的 `h-5/h-6`（0,1,0）⇒ 分隔线撑成容器全高、撑破 flex-wrap 多行工具栏。修：scoped CSS `.markdown-editor :deep([data-slot=separator][data-orientation=vertical]){height:1.5rem}`（0,4,0 钉回 24px）。这是 [[cn-is-pure-clsx-no-tailwind-merge]] 的进阶：data-attr variant 不只是源序问题，其 attr selector 本身就把特异性抬到 0,2,0，普通 h-X 赢不了，只能 scoped CSS 兜底。
3. 工具栏按钮用 `size="icon-sm"`（=size-8，32px），别写 `size="icon" class="size-8"` —— clsx 不去重，size-9 与 size-8 并存，Tailwind 源序 size-9 赢 → 36px（每个图标「占两格高」）。

## 表格上下文切换工具栏内容

同一条工具栏里 `<template v-if="activeFlags.table">表格组</template><template v-else>常规组</template>` 整体替换。表格组 = 行（上方/下方/删行）+ 列（左侧/右侧/删列）+ 表头行/合并/拆分/删除表格；`activeFlags.table` 由 `syncState` 刷（`ed.isActive("table")`，事务后同步）。

**双工具栏**：工具栏抽成子组件 `app/components/markdown-editor/EditorToolbar.vue`（显式 import，不靠 Nuxt 自动导入；props: actions/activeFlags/canUndo/canRedo/canMergeCells/canSplitCell/uploading/side:'top'|'bottom'），MarkdownEditor 顶部（border-b）+ 底部（border-t）各渲染一份。actions 是父组件闭包对象（各函数内引用 `editor.value`，引用稳定），activeFlags 等是 ref→prop ⇒ 两份共享同一组响应式数据，光标进表格时两份同步切到表格行列操作；链接/图片/表格弹窗仍由父组件持有、全局只渲染一次（两个工具栏的按钮都触发同一组 promptXxx）。父级 scoped 规则 `.markdown-editor :deep([data-slot=separator][data-orientation=vertical])` 对子组件内 Separator 仍生效（`:deep` 跨子组件，只要祖先 `.markdown-editor` 带父级 data-v），无需在子组件重写。

## 命令执行会 scrollIntoView

`editor.chain().focus().setImage({...}).run()` 等 —— `.focus()` 与大多数 chain 命令默认 `scrollIntoView:true`，会把 `.overflow-auto` 编辑区滚到选区/顶部。后果：点图片（`handleClickOn` 设 NodeSelection + 开弹窗）→ 编辑 src/alt → 点确定，弹窗关闭瞬间编辑区**滚回顶部**，用户刚看着的图片跑出视野。

**修法**：由全局 `watch(promptState.open)` 保存 `savedScrollTop` + 关闭时 rAF 恢复 `.overflow-auto` 的 scrollTop（MarkdownEditor.vue:301-322，注释明确 setImage 的滚动由该 rAF 覆盖）。`.run()` 同步派发事务、scrollIntoView 在派发期间同步发生，所以 restore 紧跟 `.run()` 之后即可拦住。

**验证**：合成点击（`img.click()`/`dispatchEvent`）触发不了 ProseMirror 的 `handleClickOn`（需 trusted 事件 + mousedown→mouseup→click 完整序列）；但工具栏图片按钮（`@click="actions.image"`）走**同一个** `confirmPrompt` 图片分支，Vue 的 `@click` 能被合成 click 触发 ⇒ 用这条路径端到端验 scrollTop 保真（setScroll 1000→确定→after 仍 1000）。注意 Vue DOM 更新异步：点击后 `querySelector('[role=dialog]')` 要 `await setTimeout` 等下一拍才找得到。

相关：[[tiptap-markdown-roundtrip-gotchas]]、[[markdown-editor-save-revert-writeback]]
