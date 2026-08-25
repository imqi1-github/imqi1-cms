// markdown widget 挂载层的纯工具：HTML 属性转义 + 占位符参数解析。
// 与页面里原内联实现行为一致（从 [slug].vue 搬来，避免内联 type/重复）。

/** HTML 属性值转义（& " < > '）。 */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

/** 解码百分号编码，非法时回退到原始串（bad % 不抛错拖垮页面）。 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 解析 ":img url | caption" 一行：| 分隔则 caption 取其余；否则空白分隔。 */
export function parseImageLine(line: string): { src: string; caption: string } {
  const pipeParts = line.split("|").map(part => part.trim());
  if (pipeParts.length > 1) {
    return {
      src: pipeParts[0] || "",
      caption: pipeParts.slice(1).join(" | ").trim(),
    };
  }
  const [src = "", ...captionParts] = line.trim().split(/\s+/);
  return {
    src,
    caption: captionParts.join(" ").trim(),
  };
}
