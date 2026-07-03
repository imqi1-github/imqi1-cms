import { createHmac, timingSafeEqual } from "node:crypto";

import type { H3Event } from "h3";

/**
 * 小程序 API 的 HMAC-SHA256 签名校验。
 *
 * 定位：`/api/mini/*` 是公开跨源接口（referer-check 已整体放行），此处用「密钥签名 + 时间戳」
 * 抬高调用门槛，挡住 curl 直连刷接口与评论机器人。注意小程序客户端可被反编译，硬编码密钥
 * 理论上可提取，因此这是防滥用而非不可破解的强认证。
 *
 * 签名算法（客户端与服务端必须完全一致）：
 *   stringToSign = `${METHOD}\n${PATH}\n${timestamp}\n${nonce}`
 *   signature    = HMAC-SHA256(MINI_API_SECRET, stringToSign) 的小写 hex
 * 其中：
 *   - METHOD    请求方法大写，如 GET / POST
 *   - PATH      请求的完整路径含查询串，与服务端收到的 `req.url` 完全一致，如 `/api/mini/post/123`
 *   - timestamp Unix 秒级时间戳（字符串），服务端校验与当前时间偏差不超过 ±MAX_SKEW_SECONDS
 *   - nonce     客户端生成的随机串（1~128 字符），仅参与签名，用于让相同请求的签名不重复
 *
 * 请求头：
 *   - X-Mini-Timestamp: <timestamp>
 *   - X-Mini-Nonce:     <nonce>
 *   - X-Mini-Sign:      <signature hex>
 */

/** 允许的时间戳偏差（秒）。请求捕获后仅能在此窗口内被重放。 */
const MAX_SKEW_SECONDS = 300;

export interface MiniAuthResult {
  ok: boolean;
  /** 校验失败原因，仅用于服务端日志，不回传给客户端。 */
  reason?: string;
}

/**
 * 读取当前环境配置的小程序密钥。
 * @returns 密钥字符串；未配置时返回空串（调用方据此决定是否放行）。
 */
export function getMiniApiSecret(): string {
  return process.env.MINI_API_SECRET || "";
}

/**
 * 校验请求是否携带合法的小程序签名。
 * @param event H3Event
 * @param secret 已读取的密钥（由调用方传入，避免重复读环境变量）
 * @returns 校验结果
 */
export function verifyMiniSignature(event: H3Event, secret: string): MiniAuthResult {
  const headers = event.node.req.headers;
  const timestamp = headers["x-mini-timestamp"];
  const nonce = headers["x-mini-nonce"];
  const sign = headers["x-mini-sign"];

  if (typeof timestamp !== "string" || typeof nonce !== "string" || typeof sign !== "string") {
    return { ok: false, reason: "缺少签名请求头" };
  }

  // nonce 长度兜底，避免异常超长输入
  if (nonce.length < 1 || nonce.length > 128) {
    return { ok: false, reason: "nonce 长度非法" };
  }

  // 时间戳必须为整数秒且在允许窗口内
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || ts <= 0) {
    return { ok: false, reason: "时间戳格式非法" };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "时间戳过期" };
  }

  const method = (event.node.req.method || "GET").toUpperCase();
  const path = event.node.req.url || "";
  const stringToSign = `${method}\n${path}\n${timestamp}\n${nonce}`;
  const expected = createHmac("sha256", secret).update(stringToSign, "utf8").digest("hex");

  // 定长比较，防时序侧信道；长度不同直接判定失败（timingSafeEqual 要求等长）
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(sign, "utf8");
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, reason: "签名不匹配" };
  }

  return { ok: true };
}
