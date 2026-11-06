import { getRequestPath, getResponseHeader, setResponseHeader } from "h3";

import { cacheControlFor304 } from "#server/utils/cache-control";

/**
 * 304 响应的缓存头修正。
 *
 * Nitro 的缓存处理器命中条件请求（If-None-Match）时直接回 304，而 304 走不到
 * `beforeResponse` 钩子（h3 在 event.handled 时跳过它）→ 304 会带着
 * `max-age=<源站 TTL>`（6 小时）出去，把边缘 TTL 顶回去，内容 6 小时不更新。
 *
 * 这里在响应头发出去前（writeHead）按路径改写成该路径真正的边缘 TTL：
 * 列表页短 TTL、内容页长 TTL。改完之后源站可以正常回 304：
 * 边缘/浏览器的重新验证只传头不传正文，降 TTL 的回源流量几乎不涨。
 */
export default defineEventHandler((event) => {
  if (process.env.NODE_ENV !== "production") return;

  const res = event.node.res;
  const original = res.writeHead.bind(res);
  res.writeHead = ((statusCode: number, ...rest: unknown[]) => {
    if (statusCode === 304) {
      const path = getRequestPath(event).split("?")[0] || "/";
      // 已显式 no-store 的（后台等）不动
      if (!String(getResponseHeader(event, "cache-control") ?? "").includes("no-store")) {
        const cacheControl = cacheControlFor304(path);
        if (cacheControl) setResponseHeader(event, "cache-control", cacheControl);
      }
    }
    return (original as (...args: unknown[]) => unknown)(statusCode, ...rest);
  }) as typeof res.writeHead;
});
