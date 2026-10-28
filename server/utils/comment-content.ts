/**
 * 评论内容入库净化（主站 comments.post 与小程序 mini/comments.post 共用）。
 *
 * 落库的是「纯文本」：无 HTML 标签、无 HTML 实体。
 * - 去标签：DOMPurify 用空 ALLOWED_TAGS 只保留文本节点（script/style 的内容一并丢掉），
 *   杜绝 <script>/<img> 等原始标签入库；
 * - 解实体：DOMPurify 序列化文本节点时会把 & < > 编码成实体，入库前解回字面字符。
 *   渲染端 escapeHtml 一次即所见即所得；若不解回来，页面会显示字面量 &amp; / &lt;
 *   （存储层编码一次 + 渲染层再编码一次 = 双重转义）。
 *
 * 不开 SAFE_FOR_TEMPLATES：它会直接删掉 {{ ... }} / <% ... %> 这类内容，
 * 而评论走 v-html 渲染，不存在模板编译，不存在模板注入面。
 */
import DOMPurify from "isomorphic-dompurify";

import { decodeEntities } from "#shared/html";

export function sanitizeCommentContent(input: string): string {
  if (!input) return "";
  const text = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_SELF_CLOSE_IN_ATTR: false,
    WHOLE_DOCUMENT: false,
  });
  return decodeEntities(text);
}
