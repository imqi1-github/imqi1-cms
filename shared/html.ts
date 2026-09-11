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

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
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
}
