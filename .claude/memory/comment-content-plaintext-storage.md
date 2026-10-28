# 评论内容：入库纯文本 + 渲染转义一次

## 不变式
- **入库存纯文本**（无 HTML 标签、无 HTML 实体）：`server/utils/comment-content.ts` 的 `sanitizeCommentContent()`
  = DOMPurify `ALLOWED_TAGS: []`（剥标签，script/style 内容一并丢）+ `decodeEntities()`（`&` `<` `>` 解回字面字符）
- **渲染转义一次**：`shared/html.ts` 的 `escapeHtmlWithLinks()`；前端 `app/utils/emoji.ts` 的 `parseEmojiContent()` 在其上再把 `:[key]` 换成受控 img
- 三条写入路径统一走 `sanitizeCommentContent`：`comments.post` / `mini/comments.post` / 后台编辑 `admin/comments/[id].patch`

## 为什么（改之前的坑）
旧实现是「DOMPurify 白名单放行 p/br/strong/em/a/img/code/pre → 渲染端再全量 escapeHtml」：
1. **白名单空转**——库里 0 条评论含 `<`；标签即使入库也会被渲染端转义成字面量，等于只留了「吞标签」的副作用
2. **双重转义**——DOMPurify 把 `&` 编成 `&amp;` 存库，渲染端再转义一次 → 页面显示字面量 `&amp;` / `&lt;`
3. `SAFE_FOR_TEMPLATES: true` 直接**删掉** `{{ ... }}` / `<% ... %>` 内容；评论走 v-html，没有模板编译面，已去掉

## 换行
- 换行一直是**入库就存 `\n`**（`useEmojiRichInput.readDom` 把 `<br>` 读成 `\n`），历史 142/1238 条评论带 `\n`
- **但主站渲染把它折叠了**：`EmojiParser.vue` 的 span 必须带 `whitespace-pre-wrap`，否则 HTML 默认折叠空白，多行评论显示成一行
- 小程序端 `comment-node.vue` 本来就有 `white-space: pre-wrap`（所以两端曾不一致）
- 邮件通知要在 `server/utils/emoji-mail.ts` 的 `renderContent` 里把 `\n` 转 `<br>`
- 判据：span 的 `getBoundingClientRect().height`——pre-wrap 两行 49px vs normal 一行 23px

## 裸链
- `escapeHtmlWithLinks` 只认 http(s)（防 `javascript:` / `data:`），URL 字符集不含 CJK 与引号，尾部中英文标点不入链，括号配平时保留 `)`
- **必须在原文上匹配并分段处理**：先整体转义的话 URL 里的 `&` 变成 `&amp;`，正则会被截断
- 外链一律 `target="_blank" rel="nofollow noopener noreferrer"`

## 坑
- `shared/html.ts` 里别用 NUL 等控制字符当占位符：Windows 下 Edit/Write 会把文件当二进制拒写（改用可打印哨兵或分段实现）
- 评论相关的 e2e（`test/e2e/user-actions/comment-reply.spec.ts`）会被百度审核把 `e2e-parent-<时间戳>` 判成「疑似违规」→ 待审核不进公开列表 → 用例失败；**与代码改动无关**（stash 后基线同样失败）
- 服务端按 IP 限评论间隔 60s，连着跑两个 e2e 会撞 429
