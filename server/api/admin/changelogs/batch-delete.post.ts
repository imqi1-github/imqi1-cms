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

  const body = (await readBody(event)) ?? {};
  const { ids, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw createError({
      statusCode: 400,
      message: "请选择要删除的更新日志",
    });
  }

  // 严格校验每个元素为正整数：Number(true)=1、Number(null)/''=0、负数都会误删非目标记录；
  // 只有 Number.isSafeInteger(n) && n>0 才放行
  const idList = Array.from(
    new Set(
      ids
        .map((id: unknown) => (typeof id === "number" ? id : Number(id)))
        .filter((n): n is number => Number.isSafeInteger(n) && n > 0),
    ),
  );
  if (idList.length === 0) {
    throw createError({
      statusCode: 400,
      message: "更新日志 ID 无效",
    });
  }

  try {
    await prisma.changelogs.deleteMany({
      where: {
        id: { in: idList },
      },
    });

    // 更新日志变更 → 立即失效更新日志页/首页 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/changelogs"] }).catch(err => console.error("[cache] 更新日志批量删除失效缓存失败", err));

    return {
      success: true,
      message: `成功删除 ${idList.length} 条更新日志`,
      count: idList.length,
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
