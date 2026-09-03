import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

/**
 * 两步验证状态（已登录，GET）：供后台「安全」设置页判断显示「启用 / 停用」。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "未登录" });
  }

  const dbUser = await prisma.users.findUnique({
    where: { uid: user.uid },
    select: { totp_enabled: true, totp_secret: true },
  });

  return {
    enabled: dbUser?.totp_enabled ?? false,
    pendingSetup: !!dbUser?.totp_secret && !dbUser?.totp_enabled,
  };
});
