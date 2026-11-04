/**
 * 页面响应的 ETag + 304
 *
 * 为什么需要：CDN 边缘的「标记过期」型刷新是回源发条件请求（If-None-Match），
 * 源站认得 If-None-Match 才回 304 只传头部、不重传整页 HTML；
 * EdgeOne 的「缓存预刷新」同理（节点在缓存过期前回源验证）。
 * 浏览器侧也一样：页面下发 `max-age=0`（每次回源校验），没有 ETag 就要重下整页。
 *
 * 只对 HTML 页面生效；命中时返回 304（无正文）。
 */

import { getRequestHeader, setResponseHeader } from "h3";

import { computeEtag, matchesIfNoneMatch } from "../utils/etag";

/** response.headers 可能是普通对象或 Headers 实例，两种都要能读能删 */
function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers as Headers & Record<string, string>;
  if (typeof h.get === "function") return h.get(name) ?? undefined;
  return h[name] ?? h[name.toLowerCase()];
}

function deleteHeader(headers: unknown, name: string): void {
  if (!headers) return;
  const h = headers as Headers & Record<string, string>;
  if (typeof h.delete === "function") {
    h.delete(name);
    return;
  }
  Reflect.deleteProperty(h, name);
  Reflect.deleteProperty(h, name.toLowerCase());
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:response", (response, { event }) => {
    const body = response.body;
    if (typeof body !== "string" || !body) return;

    const headers = response.headers;
    const contentType = readHeader(headers, "content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) return;

    const etag = computeEtag(body);
    setResponseHeader(event, "etag", etag);

    if (!matchesIfNoneMatch(getRequestHeader(event, "if-none-match"), etag)) return;

    response.statusCode = 304;
    response.body = null;
    deleteHeader(headers, "content-length");
    deleteHeader(headers, "content-type");
  });
});
