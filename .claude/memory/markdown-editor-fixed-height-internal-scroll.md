---
name: markdown-editor-fixed-height-internal-scroll
description: "MarkdownEditor 根固定高度(flex-col + editorHeight 拖拽持久化,非 h-[calc(100vh-200px)])+编辑区 flex-1 overflow-auto 内部滚动;工具栏在 flex 头部天然固定无需 sticky/fixed;表格上下文 v-if 整体切换工具栏内容,废弃旧 fixed 浮层方案;命令 .focus() 默认 scrollIntoView 会把编辑区滚到选区/顶部,改图后须保存/恢复 scrollTop(合成点击触发不了 PM handleClickOn,改走工具栏按钮同分支验)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 629fe2c3-bb89-4d73-8fd1-8f2546ff16e0
---

`app/components/MarkdownEditor.vue` 布局与表格工具栏方案(2026-08-05 重构,取代旧 fixed 浮层):

**根固定高度 + 编辑区内部滚动是根本解法**。（**2026-08-23 起根 div 已不写死 `h-[calc(100vh-200px)]`**，改 `flex flex-col` + `:style="{ height: editorHeight + 'px' }"`——底部拖拽手柄调整高度并持久化 **localStorage**（默认 720、min 320、max 3000，`EDITOR_HEIGHT_*` 常量；SSR/客户端首帧取默认避免 :style 水合 mismatch，onMounted 再读 localStorage 覆盖）。）内层 `flex min-h-0 flex-1 flex-col`,编辑区 `min-h-0 flex-1 overflow-auto`。5114px 长内容在 439px 编辑区内**内部滚动**(`scrollTop` 真实变化),整页不再被撑到 5000+px。这修掉了"实际滚动跑到 window 层"——早期 `h-full` 高度链断(两个调用方 `edit.vue` 外层 `Card.overflow-hidden > CardContent.p-0 > ...` 全无固定高度),编辑区 `overflow-auto` 不触发、`scrollTop` 恒 0。

**工具栏在 flex 头部天然固定,无需 sticky/fixed**。工具栏是编辑器根 flex 的第一子、编辑区是第二子;只有编辑区 `overflow-auto` 滚,工具栏不参与滚 → 永远钉在编辑器顶可见。不用 `position: sticky`(会被 `Card.overflow-hidden` 祖先截成相对它的无效 sticky——overflow:hidden 是 scroll container 但自身不滚),更不用 fixed+视口坐标+scroll/resize 监听那套。

**三个叠加坑(2026-08-05 补,缺一就"下一行溢出")**:① 工具栏 div 必须带 `shrink-0`(`flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 p-2`),否则在 flex-col 父里被编辑区 `flex-1` 压缩(clientH<scrollH),第二行按钮被挤出工具栏叠到编辑区。② 工具栏 Separator(vertical)受 reka 组件内置 `data-[orientation=vertical]:h-full` 控制,该规则特异性 **0,2,0**(class+attr)压过传入的 `h-5/h-6`(0,1,0),分隔线撑成容器全高(实测 68px)、撑破 flex-wrap 多行工具栏(scrollH 148>clientH 84)。修:scoped CSS `.markdown-editor :deep([data-slot=separator][data-orientation=vertical]){height:1.5rem}`(特异性 0,4,0 钉回 24px)。这是 [[cn-is-pure-clsx-no-tailwind-merge]] 的进阶:data-attr variant 不只是源序问题,其 attr selector 本身就把特异性抬到 0,2,0,普通 h-X 永远赢不了,只能 scoped CSS 兜底。③ 工具栏按钮用 `size="icon-sm"`(=size-8,32px),别写 `size="icon" class="size-8"`——后者 clsx 不去重,size-9 与 size-8 并存,Tailwind 源序 size-9 赢→36px(每个图标"占两格高")。

**表格上下文切换工具栏内容**:同一条工具栏里 `<template v-if="activeFlags.table">表格组</template><template v-else>常规组</template>` 整体替换。表格组=行(上方/下方/删行)+列(左侧/右侧/删列)+表头行/合并/拆分/删除表格;`activeFlags.table` 由 `syncState` 刷(`ed.isActive("table")`,事务后同步)。**废弃旧 fixed 浮层**:`updateTableToolbarPos`/`getActiveTableDom`/`tableToolbarStyle`/`tableToolbarRef`/`editorScrollRef`/scroll+resize watch 约 60 行定位代码全删。eslint stylistic 未启 `vue/html-indent`,`<template v-else>` 内按钮保留原缩进(不 +2)不报错,省掉批量调缩进。

固定高度 offset `200px` ≈ admin header(h-14=56)+ main p-6(24)+ TabsList(~40)+ TabsContent mt-6(24)+ border。编辑器固定高后内容不再溢出 Card,外层 `Card.overflow-hidden` 留不留都无影响(两个调用方未改)。

**命令执行会 scrollIntoView(2026-08-05 补)**:`editor.chain().focus().setImage({...}).run()` 等——`.focus()` 与大多数 chain 命令默认 `scrollIntoView:true`——会把 `.overflow-auto` 编辑区滚到选区/顶部。后果:点图片(`handleClickOn` 设 NodeSelection + 开弹窗)→ 编辑 src/alt → 点确定,弹窗关闭瞬间编辑区**滚回顶部**,用户刚看着的图片跑出视野。修:**（2026-08-23 更新）** 滚动恢复不再在 `confirmPrompt` 里存还原，改由全局 `watch(promptState.open)` 保存 `savedScrollTop` + 关闭时 rAF 恢复 `.overflow-auto` 的 scrollTop（MarkdownEditor.vue:301-322，注释明确 setImage 的滚动已由该 rAF 覆盖）；旧的 `confirmPrompt` 内 `ed.view.dom.closest('.overflow-auto')?.scrollTop` 保存/恢复写法已废弃。注意 `.run()` 同步派发事务,scrollIntoView 在派发期间同步发生,所以 restore 紧跟 `.run()` 之后即可拦住。验证时合成点击(`img.click()`/`dispatchEvent`)触发不了 ProseMirror 的 `handleClickOn`(需 trusted 事件 + mousedown→mouseup→click 完整序列);但工具栏图片按钮(`@click="actions.image"`)走**同一个** `confirmPrompt` 图片分支,Vue 的 `@click` 能被合成 click 触发——用这条路径端到端验 scrollTop 保真即可(setScroll 1000→确定→after 仍 1000)。注意 Vue DOM 更新异步:点击后 `querySelector('[role=dialog]')` 要 `await setTimeout` 等下一拍才找得到。

**双工具栏(2026-08-05 补)**:工具栏抽成子组件 `app/components/markdown-editor/EditorToolbar.vue`(显式 import,不靠 Nuxt 自动导入;props: actions/activeFlags/canUndo/canRedo/canMergeCells/canSplitCell/uploading/side:'top'|'bottom'),MarkdownEditor 顶部(border-b)+ 底部(border-t)各渲染一份。actions 是父组件闭包对象(各函数内引用 editor.value,稳定引用),activeFlags 等是 ref→prop,两份共享同一组响应式数据 → 光标进表格时 activeFlags.table 翻转,两份同步切到表格行列操作;链接/图片/表格弹窗仍由父组件持有全局只渲染一次(两个工具栏的 link/image/table 按钮都触发同一组 promptXxx)。父级 scoped 规则 `.markdown-editor :deep([data-slot=separator][data-orientation=vertical])` 对子组件内 Separator 仍生效(:deep 跨子组件,只要祖先 .markdown-editor 带 data-v-parent 即可),无需在子组件重写。

相关:[[tiptap-markdown-roundtrip-gotchas]](同编辑器其他坑)。
