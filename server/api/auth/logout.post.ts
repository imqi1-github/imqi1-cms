import { clearSession } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 登出是 per-user 敏感操作，响应不可被浏览器/代理缓存，避免缓存到已登出前的状态
  setResponseHeader(event, "Cache-Control", "no-store");

  await clearSession(event);

  return {
    success: true,
  };
});
