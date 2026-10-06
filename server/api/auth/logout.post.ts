import { clearSession, getUser } from "#server/lib/auth";
import { log } from "#server/utils/log";

export default defineEventHandler(async event => {
  // 登出是 per-user 敏感操作，响应不可被浏览器/代理缓存，避免缓存到已登出前的状态
  setResponseHeader(event, "Cache-Control", "no-store");

  const user = await getUser(event);
  await clearSession(event);
  if (user) log.auth("登出", { 用户: user.name });

  return {
    success: true,
  };
});
