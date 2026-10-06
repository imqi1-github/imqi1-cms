/**
 * API 访问日志中间件：每个 /api/* 请求结束后输出一行结构化日志。
 *
 * 设计：
 *   - 用 res.on('finish') 监听而非 await next()：避免阻塞响应链；
 *     同时确保读到最终 statusCode（h3 在 res.end 后才更新）。
 *   - 路径/query/UA 仅取合理长度，防恶意超长 URL 把日志撑爆。
 *   - body 不打（密码/TOTP/code 等敏感字段），仅 method/path/status/duration/ip/ua。
 *   - 命中 /api/health、/api/csrf/token 等高频低价值路径：跳过（避免日志洪）。
 *
 * 与 rate-limit middleware 顺序：access-log 监听 res.on('finish') 不影响响应，
 * 两者先后无所谓；放在 rate-limit 之后能保证 429 也被记录（即使 rate-limit 先 throw 也算 finish）。
 */

import type { H3Event } from "h3";
import { getMethod, getRequestURL } from "h3";

import { log } from "#server/utils/log";
import { getClientIp } from "#server/utils/client-ip";

const SKIP_PATH_PREFIXES = [
  "/api/health",
  "/api/csrf/token", // 每次保存都取 token，会刷屏
  "/api/site", // SSR 预取 + 客户端首屏各一次，高频低价值
  "/api/amap/config",
];

const MAX_PATH_LENGTH = 256;
const MAX_UA_LENGTH = 200;

function shouldSkip(path: string): boolean {
  for (const prefix of SKIP_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export default defineEventHandler((event: H3Event) => {
  const url = getRequestURL(event);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return;
  if (shouldSkip(path)) return;

  const start = Date.now();
  const method = getMethod(event);
  const ip = getClientIp(event);
  const ua = (event.node.req.headers["user-agent"] as string | undefined) ?? "";

  // 监听 finish：响应已写出（statusCode / res 头已确定）
  event.node.res.on("finish", () => {
    const durationMs = Date.now() - start;
    const status = event.node.res.statusCode;
    log.access("req", {
      method,
      path: truncate(path, MAX_PATH_LENGTH),
      status,
      durationMs,
      ua: truncate(ua, MAX_UA_LENGTH),
      ip,
    });
  });
});