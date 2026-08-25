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
      message: "缺少订阅 ID",
    });
  }
  const subId = Number(id);
  if (!Number.isInteger(subId) || subId <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的订阅 ID",
    });
  }

  const csrfToken = getHeader(event, "x-csrf-token") as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  try {
    await prisma.subscribes.delete({
      where: { id: subId },
    });
    return { success: true };
  } catch (error) {
    // 删除不存在的订阅（预期 404，先于 console.error，免得打印预期 4xx 堆栈）
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "订阅不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除订阅失败",
    });
  }
});
