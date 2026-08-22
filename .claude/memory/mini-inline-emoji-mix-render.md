---
name: mini-inline-emoji-mix-render
description: 小程序评论区行内表情混排范式——token 分段渲染、根相对路径补 siteUrl、跨边界常量手动同步
metadata: 
  node_type: memory
  type: project
  originSessionId: 04086897-cc56-47da-ab84-7d23432eda0c
---

小程序端显示含表情的评论(占位符 `:[heo-微笑]`)时:无 v-html、`<text>` 不能嵌 `<image>`,须把文本切成有序 text/emoji token 数组,`<view>` 内 `<block v-for>` 出 `<text>`(文字段)+ `<image class="inline-block;vertical-align:middle;48rpx">(表情段)。范式见 `mini/src/components/comment-node/comment-node.vue` + `mini/src/utils/emoji.ts` 的 `parseCommentContent`(用 `matchAll(/:\[([^\]]+)\]/g)` 切片,未命中表的占位符原样并入 text 段,绝不丢字)。

根相对资源路径(`/emojis/heo-sticker/微笑.png`)在小程序自己的域名下打不开,必须用 `siteConfig.siteUrl` 补全成 `https://imqi1.com/emojis/...`(与 markdown-nodes 的 resolveHref 同理;http/https 绝对地址原样返回)。

**Why:** 小程序组件模型与 web 差异大(text 是纯文本组件、image 默认带宽高偏块状);且 mini 是独立子项目,tsconfig 仅 include `src/`,没有 `~~`/shared/app 别名。
**How to apply:** 跨边界数据/常量手动同步复制——`app/assets/emojis.json` 复制一份到 `mini/src/assets/emojis.json`、EMOJI_CATEGORIES 常量内联进 `mini/src/utils/emoji.ts`(与 `mini/src/types/changelog.ts` 手动同步主站常量同一惯例)。注意 capoo 分类是 `.gif`、Heo/Cat 是 `.png`,扩展名不统一 → path 必须查 EMOJI_PATH_MAP 表,不能从 key 推导。同类"文字+图片行内混排"需求(如 markdown 行内表情)可复用此 token 分段范式。相关:[[mini-live-photo-click-play]]
