/**
 * ETag 计算与条件请求匹配（server/plugins/etag.ts 消费）
 *
 * 用途：CDN 边缘的「标记过期」型刷新是回源发条件请求（If-None-Match），
 * 源站认得才回 304 只传头部、不重传整页 HTML；浏览器侧同理。
 */

import { createHash } from "node:crypto";

/** Nuxt payload 在 HTML 里的位置（内容是 devalue 的扁平数组） */
const PAYLOAD_RE = /<script type="application\/json"[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/;

/**
 * 抹平 payload 里随请求变化的字段
 *
 * `timeSsrStart` 是 Nuxt 的 SSR 计时戳，每次渲染都不同。它在 devalue 扁平数组里
 * 是「对象里存下标、值另存数组」的形式（如 `{"timeSsrStart":498}` + 数组第 498 项），
 * 所以得按数组下标去改，改完再拼回 HTML。改不掉就原样返回（ETag 会变，只是 304 不生效，无害）。
 */
export function normalizePayload(body: string): string {
  const match = body.match(PAYLOAD_RE);
  if (!match?.[1]) return body;

  try {
    const payload = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(payload)) return body;

    for (const item of payload) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const index = (item as Record<string, unknown>).timeSsrStart;
      if (typeof index === "number" && index >= 0 && index < payload.length) {
        payload[index] = 0;
      }
    }
    // 用函数形式替换：JSON 里可能含 $& 之类的替换模式
    return body.replace(match[1], () => JSON.stringify(payload));
  } catch {
    return body;
  }
}

/** 计算页面响应的 ETag（强校验器，带引号） */
export function computeEtag(body: string): string {
  const hash = createHash("sha256").update(normalizePayload(body)).digest("base64url").slice(0, 27);
  return `"${hash}"`;
}

/** 请求的 If-None-Match 是否命中（支持 `*`、多值列表、W/ 弱前缀） */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const trimmed = header.trim();
  if (trimmed === "*") return true;
  return trimmed.split(",").some(part => part.trim().replace(/^W\//, "") === etag);
}
