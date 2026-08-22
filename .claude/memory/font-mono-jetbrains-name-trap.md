---
name: font-mono-jetbrains-name-trap
description: 代码字体 family 名必须逐字对齐 public/fonts/font.css 的 @font-face 注册名（无空格 JetBrainsMono，分 ASCII/Symbols/Rest 三片，Rest 片含 Nerd Font 图标 PUA 字形）；Tailwind v4 preflight 经 --default-mono-font-family 把 pre/code 绑到项目 --font-mono，改 --font-mono 一处全局生效（前台代码块也走它，非继承 body）
metadata: 
  node_type: memory
  type: project
  originSessionId: 53718f43-9797-4197-84da-adf6c201bcc6
---

主站代码字体：`public/fonts/font.css` 的 @font-face 注册 `font-family: JetBrainsMono`（**无空格**），由 `nuxt.config.ts` 的 `<link href=publicCdnAsset("/fonts/font.css")>` 从 CDN 加载。分三片按 unicode-range 加载：ASCII(u+00??) / Symbols(u+0100-206f,2190-23ff，箭头/数学/Powerline) / Rest(u+0250-10ffff，含 Nerd Font 图标 PUA 字形 U+E000+)，三片均 weight 400。

**现象**：代码块不等宽 + Nerd Font 图标（终端/分支等 PUA 字形）显示成豆腐块。

**根因**：family 名是字符串精确匹配。@font-face 注册的是无空格 `JetBrainsMono`，引用处若写成 `"JetBrains Mono"`（带空格）→ 匹配不上 @font-face → 整条 mono 栈失效，回退到栈里下一个。更糟的是 `font-family: JetBrains Mono, monospace;`（**无引号带空格**）：CSS 解析为 `JetBrains` + `Mono` 两个独立 family token，直接落空到 monospace。

**Why**：差一个空格/引号，family 解析就 null，静默回退；表现是"字体没生效但也不报错"，难定位。

**How to apply**：
1. `--font-mono`（`app/assets/css/main.css` @theme）和各页面硬编码 font-family 都写无空格 `"JetBrainsMono"`，或直接 `var(--font-mono)` 统一。
2. 回退栈用**真等宽**：`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`（先前栈误写 `ui-sans-serif, system-ui, sans-serif`，连等宽都不是，雪上加霜）。emoji 兜底放最后，不抢 PUA 图标字形。
3. **改 --font-mono 一处即全局生效**：Tailwind v4 preflight 给 `pre, code, kbd, samp` 设 `--theme(--default-mono-font-family, …)`，而 `--default-mono-font-family` 默认解析为项目 `--font-mono`。所以**前台代码块（含 Shiki 渲染的 `.shiki pre`、行内 code）也走 --font-mono，不是继承 body**——别去每个页面找 pre 字体，根源在 --font-mono。
4. mini 端独立：`mini/src/config/env.ts` 的 `codeFontFamily='JetBrainsMono'` + CDN `JetBrainsMono-Rest.woff2`，本来就对，别动。

2026-08-08 修：`main.css` --font-mono 改名 + 回退栈改真等宽；`index.vue`/`changelogs.vue`/`admin/changelogs.vue` 的行内 code `font-family: JetBrains Mono, monospace` 改 `var(--font-mono)`。`index.vue:982` 的 `"JetBrains Mono"` 是首页字体展示列表的显示文本（给用户看的官方名），保留。
