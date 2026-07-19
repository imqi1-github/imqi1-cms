import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少链接 ID",
    });
  }

  const csrfToken = getHeader(event, "x-csrf-token") as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    await prisma.links.delete({
      where: { id: Number(id) },
    });
    return { success: true };
  } catch (error) {
    console.error(error);

    // 删除不存在的链接：Prisma P2025 → 404，避免被统一吞成 500
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "链接不存在" });
    }

    throw createError({
      statusCode: 500,
      message: "删除链接失败",
    });
  }
});
