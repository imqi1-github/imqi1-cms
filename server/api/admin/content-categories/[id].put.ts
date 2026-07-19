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
      message: "缺少文章 ID",
    });
  }

  const body = await readBody(event);
  const { categoryIds, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!Array.isArray(categoryIds)) {
    throw createError({
      statusCode: 400,
      message: "categoryIds 必须是数组",
    });
  }

  try {
    // 删除现有的分类关系
    await prisma.contentrelations.deleteMany({
      where: { cid: Number(id) },
    });

    // 创建新的分类关系
    if (categoryIds.length > 0) {
      await prisma.contentrelations.createMany({
        data: categoryIds.map((mid: number) => ({
          cid: Number(id),
          mid,
        })),
      });
    }

    return {
      success: true,
      message: "分类更新成功",
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新文章分类失败",
    });
  }
});
