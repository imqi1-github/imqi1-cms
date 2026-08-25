import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

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

  try {
    const relations = await prisma.contentrelations.findMany({
      where: {
        cid: Number(id),
        metas: {
          type: "category",
        },
      },
      include: {
        metas: true,
      },
    });

    return {
      success: true,
      data: relations.map(r => r.metas),
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取文章分类失败",
    });
  }
});
