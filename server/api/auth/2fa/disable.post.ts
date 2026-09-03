import { deleteCookie } from "h3";

import { getUser, verifyPassword } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import { verifyTOTP } from "#server/utils/totp";
import { TRUSTED_DEVICE_COOKIE } from "#server/utils/security-token";

/**
 * 停用两步验证（已登录 + CSRF）：需确认身份 —— 提供正确的 6 位动态码，或（若登录器损坏）改输账户密码。
 * 停用后清除密钥与「信任此设备」cookie。
 */
export default defineEventHandler(async event => {
  const sessionUser = await getUser(event);
  if (!sessionUser) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const body = await readBody(event).catch(() => ({}));
  const { csrfToken, code, password } = body ?? {};
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  const dbUser = await prisma.users.findUnique({
    where: { uid: sessionUser.uid },
    select: { password: true, totp_secret: true, totp_enabled: true },
  });
  if (!dbUser?.totp_enabled) {
    throw createError({ statusCode: 400, message: "两步验证尚未开启" });
  }

  // 身份确认：优先动态码（需要 totp_secret），否则回退到账户密码
  let confirmed = false;
  if (typeof code === "string" && dbUser.totp_secret) {
    confirmed = verifyTOTP(dbUser.totp_secret, code);
  }
  if (!confirmed && typeof password === "string" && password.length > 0) {
    confirmed = await verifyPassword(password, dbUser.password);
  }
  if (!confirmed) {
    throw createError({ statusCode: 400, message: "动态验证码或密码不正确" });
  }

  await prisma.users.update({
    where: { uid: sessionUser.uid },
    data: { totp_enabled: false, totp_secret: null },
  });
  deleteCookie(event, TRUSTED_DEVICE_COOKIE, { path: "/" });

  return { enabled: false };
});
