import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";

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
  const linkId = Number(id);
  if (!Number.isInteger(linkId) || linkId <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的链接 ID",
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
      where: { id: linkId },
    });
    // 友链变更 → 立即失效相关 ISR 页面缓存（best-effort）
    void invalidateContentCaches({ routes: ["/links", "/map"] }).catch(err => console.error("[cache] 友链删除失效缓存失败", err));
    return { success: true };
  } catch (error) {
    // 删除不存在的链接：Prisma P2025 → 404，避免被统一吞成 500
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "链接不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除链接失败",
    });
  }
});
