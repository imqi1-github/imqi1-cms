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

// 单次扫描解码常见命名实体（非递归：&amp;lt; 只解一次成 &lt;，不会再解成 <）。
const ENTITY_RE = /&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g;

/**
 * 解码常见命名实体。
 *
 * 净化器（DOMPurify）序列化文本节点时会把 & < > 编码成实体，入库前用本函数解回字面字符，
 * 渲染端再 escapeHtml 一次即可所见即所得；否则会二次编码，页面显示字面量 &amp; / &lt;。
 */
export function decodeEntities(value: string): string {
  return value.replace(ENTITY_RE, (match, name: string) => {
    switch (name) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
      case "#39":
      case "#x27":
        return "'";
      case "nbsp":
        return " ";
      default:
        return match;
    }
  });
}

// 裸链识别：仅 http(s)；字符集限定 URL 合法字符（不含 CJK 与引号），
// 免得把紧跟 URL 的中文或引号吃进链接本体。
const URL_RE = /\bhttps?:\/\/[A-Za-z0-9\-._~:/?#@!$&()*+,;=%]+/gi;

// 链接末尾常见标点（中英文）不属于链接本体
const URL_TAIL_CHARS = new Set([".", ",", ";", ":", "!", "?", ")", "]", "}", "、", "。", "，", "；", "：", "！", "？", "）", "】", "》"]);

function countChar(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** 去掉 URL 末尾的标点；括号不配平时保留末尾 ')'（如 wiki 的 Foo_(bar)）。 */
function trimUrlTail(url: string): string {
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    if (!URL_TAIL_CHARS.has(last)) break;
    // 末尾 ')' 只有在括号不配对时才是标点（Foo_(bar) 的 ')' 属于 URL 本体）
    if (last === ")" && countChar(out, ")") <= countChar(out, "(")) break;
    out = out.slice(0, -1);
  }
  return out;
}

export interface EscapeWithLinksOptions {
  /** 链接显示文本的最大长度，超出截断加省略号（href 仍是完整 URL） */
  maxLinkTextLength?: number;
}

/**
 * 纯文本 → HTML：转义 + 裸链自动链接。
 *
 * 链接在原文上匹配并分段处理：若先整体转义，URL 里的 & 会变成 &amp;，正则会被截断。
 * 链接只认 http(s)（防 javascript: / data:），外链一律 nofollow noopener noreferrer。
 */
export function escapeHtmlWithLinks(text: string, options: EscapeWithLinksOptions = {}): string {
  if (!text) return "";
  const out: string[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = trimUrlTail(match[0]);
    if (!url) continue;
    const start = match.index ?? 0;
    out.push(escapeHtml(text.slice(last, start)));
    const label = options.maxLinkTextLength && url.length > options.maxLinkTextLength
      ? `${url.slice(0, options.maxLinkTextLength)}…`
      : url;
    out.push(`<a href="${escapeAttribute(url)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(label)}</a>`);
    last = start + url.length;
  }
  out.push(escapeHtml(text.slice(last)));
  return out.join("");
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
 * 用字符串占位符避免 no-control-regex 规则告警(纯字符串 split/replace 实现)。
 */
const ENTITY_PLACEHOLDERS = ["__LT__", "__GT__", "__AMP__", "__QT__", "__SQ__"] as const;
type Entity = "&lt;" | "&gt;" | "&amp;" | "&quot;" | "&#39;";
const ENTITIES: Entity[] = ["&lt;", "&gt;", "&amp;", "&quot;", "&#39;"];

function escapeAttributesForMutationSafety(rawHtml: string): string {
  return rawHtml.replace(ATTR_PATTERN, (_match, ws, name, value) => {
    // 先把已实体化的实体换成占位符,转义后再换回(避免双重转义)
    let escaped = value;
    for (let i = 0; i < ENTITIES.length; i++) {
      escaped = escaped.split(ENTITIES[i]!).join(ENTITY_PLACEHOLDERS[i]!);
    }
    // 转义属性值里的 < / > / &
    escaped = escaped
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // 把占位符换回原实体
    for (let i = 0; i < ENTITY_PLACEHOLDERS.length; i++) {
      escaped = escaped.split(ENTITY_PLACEHOLDERS[i]!).join(ENTITIES[i]!);
    }
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