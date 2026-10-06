/**
 * MCP Server 入口（POST /mcp）—— 把站点内容以 Model Context Protocol 暴露给 AI Agent。
 *
 * 开关：site.config.features.mcp（默认 true）→ 经 runtimeConfig.mcpEnabled 运行时判定,
 * 关闭时本路由保持注册但一律 404（镜像 _AMapService 的 amapUseServerProxy 模式）。
 * 位于 server/routes/（根级 URL）,不受 /api/* 前缀的 referer-check / access-log 约束——
 * AI 客户端无浏览器 Referer,端点自带限流与只读白名单,无需 referer 门禁。
 *
 * 设计取舍：
 *   - **只支持 POST + JSON-RPC**：用 SDK 的 legacyStatelessFallback 实现 stateless mode，
 *     无 session、无 SSE 长连接。每次请求新建一个 McpServer 实例（最干净）。
 *   - **Web Request/Response ↔ h3 双向桥接**：Nitro/h3 原生不接 Web API，桥接一次性代价换 SDK 可用。
 *   - **限流**：handler 内自建 60 次/分/IP。
 *   - **写接口不暴露**：内容工具全部 readOnlyHint:true，仅 search/get/list，无任何 mutate 工具；
 *     防止 prompt injection 把 AI 引导到删文章/改评论（参考 memory: 强安全不变式）。
 *     唯一例外是 MCP_OPS_TOKEN 门禁的运维工具组（详见 server/utils/mcp-tools.ts）：
 *     除 clear_cache（清缓存、自动重建）外其余运维工具仍只读，且未配令牌时不注册。
 */
import { legacyStatelessFallback } from "@modelcontextprotocol/server";
import type { H3Event } from "h3";
import { getRequestURL, readRawBody } from "h3";

import { createImqi1McpServer } from "#server/utils/mcp-tools";
import { consumeRateLimit } from "#server/utils/rate-limit";
import { getClientIp } from "#server/utils/client-ip";

// 限速：每分钟 60 次 / 每 IP。AI Agent 流量远小于公开 API（一个对话通常 1~5 个 tool 调用）。
const MCP_RATE_LIMIT = 60;
const MCP_RATE_WINDOW_SEC = 60;

/** 把 h3 event 的 headers 转成 Web Headers */
function toWebHeaders(event: H3Event): Headers {
  const headers = new Headers();
  const nodeHeaders = event.node.req.headers;
  for (const key of Object.keys(nodeHeaders)) {
    const value = nodeHeaders[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}

/** 把 h3 event 桥接成 Web Request（POST only） */
async function eventToWebRequest(event: H3Event): Promise<Request> {
  const url = getRequestURL(event);
  const headers = toWebHeaders(event);
  // readRawBody 在没有 body 时返 undefined / "" / Buffer 都行，统一转 Buffer
  const raw = await readRawBody(event, "binary");
  const init: RequestInit = {
    method: "POST",
    headers,
  };
  // Buffer 在 h3 编出来可能没类型（运行时是 Buffer），用 ArrayBuffer/Uint8Array 等同形式构造 body
  if (Buffer.isBuffer(raw)) {
    init.body = raw;
    // 显式标记 binary 类型，避免 SDK 误判为 string 走 text 解码
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/octet-stream");
    }
  } else if (typeof raw === "string" && raw.length > 0) {
    init.body = raw;
  }
  return new Request(url.toString(), init);
}

/** 把 Web Response 转回 h3 event：写 headers + status + body */
async function writeWebResponse(event: H3Event, res: Response): Promise<void> {
  // h3 的 setResponseStatus / setResponseHeader 必须先于 body 写出
  event.node.res.statusCode = res.status;
  res.headers.forEach((value, key) => {
    // setHeader 已是 string|number|string[] 的单参版本
    event.node.res.setHeader(key, value);
  });
  if (res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    event.node.res.end(buf);
  } else {
    event.node.res.end();
  }
}

export default defineEventHandler(async event => {
  // 功能开关（镜像 amapUseServerProxy 模式）：site.config.features.mcp 关闭时路由保持注册但一律 404
  if (!useRuntimeConfig().mcpEnabled) {
    throw createError({ statusCode: 404, message: "MCP Server is disabled." });
  }

  // 限速：AI Agent 流量单 IP 一般不高，60/min 已很宽松；防 prompt injection 把工具当放大器刷
  const ip = getClientIp(event);
  try {
    const r = await consumeRateLimit({
      key: `mcp:post:${ip}`,
      limit: MCP_RATE_LIMIT,
      windowSec: MCP_RATE_WINDOW_SEC,
    });
    if (!r.allowed) {
      const retryAfterSec = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
      // 直接设到 node res 上：setResponseHeader 的类型对动态 header name 太严
      event.node.res.setHeader("Retry-After", String(retryAfterSec));
      throw createError({
        statusCode: 429,
        message: "MCP 请求过于频繁，请稍后再试",
        data: { retryAfterMs: r.retryAfterMs },
      });
    }
  } catch (e) {
    // 已 throw 429 的不要二次包装；其他异常一律 fail-open（不阻断 MCP）
    if (e instanceof Error && "statusCode" in e && (e as { statusCode?: number }).statusCode === 429) {
      throw e;
    }
    console.error("[mcp] 限流检查失败，放行:", e);
  }

  // 仅 POST。其它方法直接 405（与 SDK 内部行为对齐）
  if (event.method !== "POST") {
    setResponseHeader(event, "Allow", "POST");
    throw createError({ statusCode: 405, message: "MCP 端点仅接受 POST" });
  }

  // 1MB body 上限，避免恶意大 body 占满内存（SDK 的 legacyStatelessFallback 不收该选项，自行前置校验）
  const declaredLength = Number(event.node.req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 1024 * 1024) {
    throw createError({ statusCode: 413, message: "MCP 请求体过大" });
  }

  // 桥接：h3 → Web Request
  let webReq: Request;
  try {
    webReq = await eventToWebRequest(event);
  } catch (error) {
    console.error("[mcp] 构造 Web Request 失败:", error);
    throw createError({ statusCode: 400, message: "MCP 请求构造失败" });
  }

  // 用 SDK 的 stateless fallback 处理：每个请求新建 McpServer 实例
  const handler = legacyStatelessFallback(
    async () => createImqi1McpServer(),
    error => {
      // 报告 MCP 处理失败（不影响响应内容；SDK 已发出 500）
      console.error("[mcp] handler error:", error);
    },
  );

  let webRes: Response;
  try {
    webRes = await handler(webReq);
  } catch (error) {
    console.error("[mcp] SDK 处理失败:", error);
    throw createError({ statusCode: 500, message: "MCP 服务内部错误" });
  }

  // 桥接：Web Response → h3
  await writeWebResponse(event, webRes);
  // h3 期待 handler 返回 undefined（响应已经通过 res.end 写出）
});