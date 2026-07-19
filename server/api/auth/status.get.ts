import { prisma } from "#server/utils/prisma";

/**
 * 是否已存在可登录用户（单用户初始化提示用）。
 *
 * 仅在系统未初始化（无用户）时返回 { hasUser: false }；已初始化后直接 404，
 * 避免成为一个常驻的、可被未认证方用来确认用户存在性的探测接口。
 * 前端登录页在接口 404/异常时默认 hasUser=true，不影响正常登录流程。
 */
export default defineEventHandler(async () => {
  const count = await prisma.users.count();

  if (count > 0) {
    throw createError({ statusCode: 404, message: "Not Found" });
  }

  return { hasUser: false };
});
