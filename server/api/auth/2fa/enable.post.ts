import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import { verifyTOTP } from "#server/utils/totp";

/**
 * 确认启用两步验证（已登录 + CSRF）：用当前 6 位动态码验证暂存的 totp_secret，通过则正式启用。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const body = await readBody(event).catch(() => ({}));
  const { csrfToken, code } = body ?? {};
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw createError({ statusCode: 400, message: "请输入 6 位动态验证码" });
  }

  const dbUser = await prisma.users.findUnique({
    where: { uid: user.uid },
    select: { totp_secret: true },
  });
  if (!dbUser?.totp_secret) {
    throw createError({ statusCode: 400, message: "请先获取两步验证密钥" });
  }

  if (!verifyTOTP(dbUser.totp_secret, code)) {
    throw createError({ statusCode: 400, message: "动态验证码错误，请重新输入" });
  }

  await prisma.users.update({
    where: { uid: user.uid },
    data: { totp_enabled: true },
  });

  return { enabled: true };
});
