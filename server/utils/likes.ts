import { createHash } from "node:crypto";

import type { H3Event } from "h3";

import { redis } from "./redis";
import { getClientIp } from "./client-ip";

/**
 * 点赞 fingerprint：SHA256(ip + "|" + userAgent) 前 32 字符。
 *
 * 设计取舍：
 *  - 用 hash 而非裸 IP：避免在 likes 表直接出现 IP（GDPR / 站内安全考量）。
 *  - 短前缀（32 字符）足以去重（16^32 空间），且节省索引大小。
 *  - 单点 IP+UA 指纹不是强身份（NAT/换浏览器可绕过），但配合复合唯一约束 + Redis 限速
 *    已足够挡住绝大多数脚本/误点 spam；后台看到异常堆积可以加严强度（如加 cookie 二次确认）。
 */
export function computeLikeFingerprint(event: H3Event): string {
  const ip = getClientIp(event);
  const ua = (event.node.req.headers["user-agent"] || "").toString().slice(0, 200);
  return createHash("sha256")
    .update(`${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

/** Redis 限速 key：likes:<cid>:<fingerprint> —— 同一访客对同一文章 5 分钟只算一次 */
export function buildLikeRateKey(cid: number, fingerprint: string): string {
  return `likes:${cid}:${fingerprint}`;
}

/** 限速窗口：5 分钟（300s）。Redis 可选：未配 Redis 时跳过限速，依赖唯一约束兜底 */
export const LIKE_RATE_TTL_SECONDS = 300;

/**
 * 触发限速检查：返回 true 表示「本次是窗口内重复请求，不写库」；false 表示放行。
 * Redis 未配置或调用失败时一律放行（fail-open），唯一约束兜底防写穿。
 */
export async function isLikeRateLimited(cid: number, fingerprint: string): Promise<boolean> {
  if (!redis) return false;
  try {
    const key = buildLikeRateKey(cid, fingerprint);
    const recent = await redis.incr(key);
    if (recent === 1) {
      await redis.expire(key, LIKE_RATE_TTL_SECONDS);
    } else if ((await redis.ttl(key)) === -1) {
      // 自愈：INCR 与 EXPIRE 之间崩溃会留下无 TTL 键 → 该访客对该文章永久限流，补上窗口
      await redis.expire(key, LIKE_RATE_TTL_SECONDS);
    }
    return recent > 1;
  } catch (error) {
    console.error("[likes] Redis 限速检查失败，按放行处理:", error);
    return false;
  }
}