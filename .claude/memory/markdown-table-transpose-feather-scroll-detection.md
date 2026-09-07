---
name: markdown-table-transpose-feather-scroll-detection
description: 表格窄屏转置+羽化:溢出检测必须读滚动容器 wrapper(非内层 table),转置表 min-width:8rem 填满自身致 table.scrollWidth≈clientWidth 永远判不出溢出
metadata:
  node_type: memory
  type: project
---

`app/composables/useMarkdownTableTranspose.ts` 的 `syncScrollAttrs` 决定 `.markdown-table-wrap` 是否可横滚并同步 `data-at-left/right`(CSS 据此给左右 24px 羽化 mask,见 `MarkdownBody.vue` `:deep(.markdown-table-wrap)`)。

**坑**:溢出检测原来写 `inner.scrollWidth > inner.clientWidth + 1`,`inner = wrap.firstElementChild`(内层 `<table>`)。表格转置后 CSS `.markdown-table-wrap > table[data-table-transposed] th,td { min-width:8rem }` 让表格填满自身盒 → `table.scrollWidth≈table.clientWidth` → **永远判不出"横向溢出"** → `data-table-scrollable/at-left/at-right` 恒不设置 → `[data-at-left="false"]` 的羽化渐变永不触发,可横滚的宽表看不到羽化(2026-09-07 修复)。

**修法**:溢出与否以**滚动容器 wrapper 自身**为准:

```js
const overflow = wrap.scrollWidth > wrap.clientWidth + 1;
```

wrapper 才是 `overflow-x:auto` 的滚动体;`wrap.scrollLeft/clientWidth/scrollWidth` 本就用 wrapper,唯独溢出检测误用了 `inner`。`inner` 仅保留 `if(!inner)` 空壳守卫。

**验证**:协议页 /agreement 表格窄屏 390px:`wrap.scrollWidth=897 > clientWidth=340`;滚到中间 `data-at-left=false 且 data-at-right=false` 两侧羽化;两端单侧羽化。桌面宽表(铺满容器 + overflow)同理由 wrapper 判,不误触。

**相联**:表格滚动条默认隐藏/悬停显示同 `MarkdownBody.vue` 该块(`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`,悬停 `thin`),与代码块惯例一致。关联 [[tiptap-markdown-roundtrip-gotchas]]。
