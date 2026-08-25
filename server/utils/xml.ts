// 非 CDATA 文本节点（<loc>/<link>/<guid>/<atom:link href> 等）里的 & < > " ' 必须转义，
// 否则 slug/baseUrl 含这些字符时整个 XML（RSS/sitemap）变为非法。CDATA 字段不用走这里。
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
