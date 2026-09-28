import DOMPurify from "isomorphic-dompurify";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 禁掉的危险 CSS url() 协议(防 style="url(javascript:)" 类 XSS)
const UNSAFE_CSS_URL_PROTOCOLS = /url\s*\(\s*(?:javascript|vbscript|data\s*:(?!image\/)|file|chrome|about|view-source|jar):/gi;

// DOMPurify 不会转义属性值里残留的 < / >,防 Mutation XSS(如 <img alt="<svg onload=...>" 中
// alt 内的 <svg> 是字面字符),通过把每个 attribute="..." 里的 < > & 转实体,迫使属性值是纯文本。
// 配合"第二道 sanitize"防止标签被重新解释为 HTML
const ATTR_PATTERN = /(\s)([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"/g;

/**
 * 后置二次净化:扫描 <element style="..."> 里的 url() 与 expression(),
 * 命中危险协议(javascript: / vbscript: / data: 非 image / file: 等)则剥离 style 属性。
 * 防 DOMPurify 默认配置下 url(javascript:) / expression(alert(1)) 等 IE/旧浏览器向量绕过。
 */
function sanitizeStyleAttribute(rawHtml: string): string {
  return rawHtml.replace(
    /\sstyle\s*=\s*"([^"]*)"/gi,
    (_match, value: string) => {
      if (UNSAFE_CSS_URL_PROTOCOLS.test(value)) {
        return "";
      }
      // 重置 lastIndex(RegExp with /g 是 stateful)
      UNSAFE_CSS_URL_PROTOCOLS.lastIndex = 0;
      return ` style="${value}"`;
    },
  );
}

/**
 * 后置净化属性值里残留的 < / > / &,防 Mutation XSS(下游 innerHTML 二次注入触发)。
 * 排除已转义的实体(&lt; &gt; &amp;):不重复转义。
 */
function escapeAttributesForMutationSafety(rawHtml: string): string {
  return rawHtml.replace(ATTR_PATTERN, (_match, ws, name, value) => {
    // 不重复转义已实体化的 &lt; / &gt; / &amp; / &quot; / &#39;
    const escaped = value
      .replace(/&lt;/g, "\x01LT\x01")
      .replace(/&gt;/g, "\x01GT\x01")
      .replace(/&amp;/g, "\x01AMP\x01")
      .replace(/&quot;/g, "\x01QT\x01")
      .replace(/&#39;/g, "\x01SQ\x01")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\x01LT\x01/g, "&lt;")
      .replace(/\x01GT\x01/g, "&gt;")
      .replace(/\x01AMP\x01/g, "&amp;")
      .replace(/\x01QT\x01/g, "&quot;")
      .replace(/\x01SQ\x01/g, "&#39;");
    return `${ws}${name}="${escaped}"`;
  });
}

/**
 * DOMPurify 默认配置:html profile + 白名单标签 + 数据属性 + target 等;
 * 加上 ALLOWED_TAGS/ATTR 默认 + 我们的后置 style/url 过滤 + 第二道净化防 Mutation XSS。
 */
export function sanitizeHtml(html: string): string {
  let cleaned = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["mark"],
    ADD_ATTR: [
      "target",
      "rel",
      "loading",
      "class",
      "style",
      "data-summary",
      "data-url",
      "data-type",
      "data-params",
      "data-lightbox",
      "data-caption",
    ],
  });
  // 第二道净化:防止 Mutation XSS(如 <img alt="<svg onload=...>"> 中 alt 内的 svg 字面被保留)
  // — 把第一道输出当作新 HTML 重新解析(此时 alt 内的 <svg> 作为新元素被 DOMPurify 移除)
  cleaned = DOMPurify.sanitize(cleaned, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["mark"],
    ADD_ATTR: [
      "target", "rel", "loading", "class", "style",
      "data-summary", "data-url", "data-type", "data-params",
      "data-lightbox", "data-caption",
    ],
  });
  // 后置过滤 1:防 url(javascript:) / expression() 绕过(IE 旧/现代浏览器部分场景)
  cleaned = sanitizeStyleAttribute(cleaned);
  // 后置过滤 2:属性值里残留的 < / > 强制实体化,防下游 innerHTML 二次注入触发 Mutation XSS
  cleaned = escapeAttributesForMutationSafety(cleaned);
  return cleaned;
}