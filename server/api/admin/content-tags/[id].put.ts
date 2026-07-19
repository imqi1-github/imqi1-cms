import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
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
  const { tagIds, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!Array.isArray(tagIds)) {
    throw createError({
      statusCode: 400,
      message: "tagIds 必须是数组",
    });
  }

  try {
    await prisma.contentrelations.deleteMany({
      where: {
        cid: Number(id),
        metas: {
          type: "tag",
        },
      },
    });

    if (tagIds.length > 0) {
      await prisma.contentrelations.createMany({
        data: tagIds.map((mid: number) => ({
          cid: Number(id),
          mid,
        })),
      });
    }

    return {
      success: true,
      message: "标签更新成功",
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新文章标签失败",
    });
  }
});
