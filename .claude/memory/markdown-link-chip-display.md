---
name: markdown-link-chip-display
description: 正文行内链接的域名图标(左侧 icon)实现位置,及「域名后缀匹配必须具体子域排在父域之前」的坑
metadata:
  type: project
---

# markdown 行内链接域名图标

`server/utils/markdown.ts` 的 `md.renderer.rules.link_open` 里,对已知域名的 markdown 行内链接,在文本前插入一个空 `<span class="markdown-link-icon markdown-link-icon--<slug>" aria-hidden="true"></span>`。**链接本身不加 class**,保持普通超链接外观(蓝色、hover 下划线);只多一个左侧域名图标。图标走 span 的 CSS `mask`+`currentColor`(随文字色),零客户端 JS。样式在 `app/pages/content/[category]/[slug].vue` 与 `app/pages/agreement.vue` 各一份 scoped `.markdown-body :deep(.markdown-link-icon)`(两页都消费 `renderMarkdown`)。图标在 `public/icons/{github,gitee,baidu,google,qq/tencent,wechat,mozilla,npm}.svg`(simple-icons 单路径剪影)。已启用域名(GitHub/Gitee/百度/谷歌/腾讯QQ/微信/Mozilla-MDN/npm)。CSP `img-src 'self' data: https:` 放行 same-origin 图标;`style-src 'unsafe-inline'` 放行内联样式。

**Why 不用 iconify 类**:参考站(blog.zhilu.site)用 `span.iconify.i-ri:...` CSS 图标类,但本仓库走 `@nuxt/icon`(inline SVG,不加载 iconify CSS),`iconify` 类在 `v-html` 里会是空 span。故复刻「左侧图标」结构,图标用 mask 实现;命名也不沿用对方的 z-link/domain-icon,用自有 `markdown-link-icon`。

**⚠️ 域名匹配排序坑(2026-08-27 实测抓到的真 bug)**:`getLinkChipDomain` 用 `host.endsWith("." + host)` 后缀匹配,数组里**更具体的子域名必须排在父域名之前**。若 `qq.com` 排在 `weixin.qq.com`/`wx.qq.com` 前,`mp.weixin.qq.com` 会因 `endsWith(".qq.com")` 先命中 tencent,微信链接拿到腾讯图标。正确顺序 = wechat(weixin.qq.com/wx.qq.com)→ tencent(qq.com/tencent.com)。新增域名同理:同域子域名(如 www./gist./mp.)靠后缀匹配自动命中,但跨产品子域(weixin.qq.com vs qq.com)必须显式分 slug 且具体者在前。

**How to apply**: 扩展 `LINK_CHIP_DOMAINS` 时,先列子域(product),再列父域;顺序一旦混乱,起 dev 用带该子域的真实 URL 验证渲染出的 `--<slug>` class。`:::repo` 仓库卡片走 Vue 组件、不走 link_open,不会被加图标。
