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

  const id = Number(getRouterParam(event, "id"));

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: "缺少地点 ID",
    });
  }

  // CSRF 验证 - 从请求头获取（避免 token 进入 URL 被日志/Referer 记录）
  // 置于 try 之外，避免 403 被下面的 catch 吞成 500
  const csrfToken = getHeader(event, "x-csrf-token");
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    await prisma.travels.delete({
      where: { id },
    });
    return { success: true };
  } catch (error) {
    // 删除不存在的地点（预期 404，先于 console.error，免得打印预期 4xx 堆栈）
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "旅行地点不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除旅行地点失败",
    });
  }
});
