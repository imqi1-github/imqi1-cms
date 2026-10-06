/**
 * 通用 API 限流中间件。
 *
 * 按 method + 路径前缀匹配规则表；命中即消耗 1 次令牌，超过则 429。
 * IP 来自 getClientIp（与 likes fingerprint 同源，已经处理 TRUSTED_PROXY）。
 *
 * 设计原则：
 *   - 只对「暴露在公网 + 高风险 + 容易被脚本刷」的端点配规则；
 *   - 已有限流的端点（/api/auth/login）由 handler 内部用 login-rate-limit.ts，不走本中间件，
 *     避免双层计数。
 *   - 中间件是 best-effort：异常一律 fail-open（放行），日志告警。
 *
 * 规则维护：在下方 RULES 数组里追加 { method, prefix, limit, windowSec, keyHint } 即可。
 */
import { consumeRateLimit } from "#server/utils/rate-limit";
import { getClientIp } from "#server/utils/client-ip";
import { log } from "#server/utils/log";

interface RateRule {
  /** 大写方法；"ANY" 表示任意方法都计数 */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ANY";
  /** 路径前缀（不含 query）。匹配时 url.pathname.startsWith(prefix) */
  prefix: string;
  /** 窗口内允许的最大请求数 */
  limit: number;
  /** 窗口大小（秒） */
  windowSec: number;
  /** 用于构造 Redis key 的命名空间（避免不同规则串扰） */
  keyHint: string;
}

// 高风险/高频端点限速规则。
// 注意 login 已经在 handler 内部用 login-rate-limit.ts 限流，不要重复配。
const RULES: RateRule[] = [
  // 评论发布：单 IP 每分钟最多 3 条（防 spam）
  { method: "POST", prefix: "/api/comments", limit: 3, windowSec: 60, keyHint: "comments:post" },
  // 点赞：单 IP 对每篇文章 5 分钟一次（与 likes.ts 内 Redis 限速互为冗余防护；
  // 这里是按 IP 维度统计，覆盖「同一访客点不同文章」的脚本行为）
  { method: "POST", prefix: "/api/contents/likes/", limit: 30, windowSec: 60, keyHint: "likes:post" },
  // 验证码拉取：每分钟 10 张（防图形识别滥刷）
  { method: "GET", prefix: "/api/captcha/", limit: 10, windowSec: 60, keyHint: "captcha:get" },
  // 搜索：每分钟 30 次（防扫）
  { method: "GET", prefix: "/api/search", limit: 30, windowSec: 60, keyHint: "search:get" },
  // 友链申请：每小时 3 次（防 spam）
  { method: "POST", prefix: "/api/links", limit: 3, windowSec: 3600, keyHint: "links:apply" },
  // 邮件相关：每小时 10 次（防发件耗尽）
  { method: "POST", prefix: "/api/admin/mail/", limit: 10, windowSec: 3600, keyHint: "admin:mail" },
  // 客户端错误上报：每分钟 5 次（防滥用把日志灌满；正常用户遇到 bug 一次即可）
  { method: "POST", prefix: "/api/error-report", limit: 5, windowSec: 60, keyHint: "error-report" },
];

function matchRule(method: string, path: string): RateRule | null {
  for (const rule of RULES) {
    if (rule.method !== "ANY" && rule.method !== method) continue;
    if (path.startsWith(rule.prefix)) return rule;
  }
  return null;
}

export default defineEventHandler(async event => {
  // 只对 API 路径生效；admin 写接口走 CSRF + login 限流，不在本中间件覆盖范围
  const url = getRequestURL(event);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return;

  const method = event.method;
  const rule = matchRule(method, path);
  if (!rule) return;

  const ip = getClientIp(event);
  const key = `${rule.keyHint}:${ip}`;

  try {
    const r = await consumeRateLimit({
      key,
      limit: rule.limit,
      windowSec: rule.windowSec,
    });
    if (!r.allowed) {
      // 标准 Retry-After（秒）+ 状态码 429
      const retryAfterSec = Math.max(1, Math.ceil(r.retryAfterMs / 1000));
      // 直接 setHeader 到 node res，绕开 h3 setResponseHeader 对动态 header name 的类型严格
      event.node.res.setHeader("Retry-After", String(retryAfterSec));
      event.node.res.setHeader("X-RateLimit-Limit", String(rule.limit));
      event.node.res.setHeader("X-RateLimit-Remaining", "0");
      log.rateLimit("hit", {
        keyHint: rule.keyHint,
        method,
        path,
        ip,
        count: r.count,
        limit: rule.limit,
        windowSec: rule.windowSec,
      });
      throw createError({
        statusCode: 429,
        message: "请求过于频繁，请稍后再试",
        data: { retryAfterMs: r.retryAfterMs },
      });
    }
    setResponseHeader(event, "X-RateLimit-Limit", String(rule.limit));
    setResponseHeader(event, "X-RateLimit-Remaining", String(Math.max(0, rule.limit - r.count)));
  } catch (error) {
    // 已显式 throw 429 的不要二次包装；其他异常一律 fail-open
    if (error instanceof Error && "statusCode" in error && (error as { statusCode?: number }).statusCode === 429) {
      throw error;
    }
    console.error("[rate-limit] 中间件异常，放行:", error);
  }
});