import { randomBytes, timingSafeEqual } from "crypto";

import { getCookie, setCookie, type H3Event } from "h3";

/**
 * 生成 CSRF Token
 * @returns CSRF Token 字符串
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 获取存储的 CSRF Token
 * @param event H3Event
 * @returns CSRF Token 或 null
 */
export function getStoredCsrfToken(event: H3Event): string | null {
  const token = getCookie(event, "csrf_token");
  return token || null;
}

/**
 * 设置 CSRF Token 到 Cookie
 * @param event H3Event
 * @returns 生成的 CSRF Token
 */
export function setCsrfToken(event: H3Event): string {
  const token = generateCsrfToken();

  setCookie(event, "csrf_token", token, {
    httpOnly: false, // 需要前端读取
    secure: import.meta.env.PROD, // 生产环境使用 HTTPS
    sameSite: "strict",
    maxAge: 60 * 60, // 1 小时
    path: "/",
  });

  return token;
}

/**
 * 验证 CSRF Token
 * @param event H3Event
 * @param providedToken 用户提供的 token
 * @returns 是否验证通过
 */
export function validateCsrfToken(event: H3Event, providedToken: string | undefined): boolean {
  const storedToken = getStoredCsrfToken(event);

  if (!storedToken) {
    console.warn("[CSRF] 未找到存储的 CSRF token");
    return false;
  }

  if (!providedToken) {
    console.warn("[CSRF] 未提供 CSRF token");
    return false;
  }

  // 定长比较防时序侧信道（与 mini-auth 一致）；长度不同直接判失败（timingSafeEqual 要求等长）
  const storedBuf = Buffer.from(storedToken, "utf8");
  const providedBuf = Buffer.from(providedToken, "utf8");
  const isValid = storedBuf.length === providedBuf.length && timingSafeEqual(storedBuf, providedBuf);

  if (!isValid) {
    console.warn("[CSRF] CSRF token 验证失败", {
      stored: storedToken.substring(0, 10) + "...",
      provided: providedToken.substring(0, 10) + "...",
    });
  }

  return isValid;
}

/**
 * 确保 CSRF Token 存在，如果不存在则创建
 * @param event H3Event
 * @returns CSRF Token
 */
export function ensureCsrfToken(event: H3Event): string {
  let token = getStoredCsrfToken(event);

  if (!token) {
    token = setCsrfToken(event);
    console.log("[CSRF] 生成新的 CSRF token");
  }

  return token;
}
