import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

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

  try {
    const relations = await prisma.postrelation.findMany({
      where: {
        cid: Number(id),
        category: {
          type: "tag",
        },
      },
      include: {
        category: true,
      },
    });

    return {
      success: true,
      data: relations.map(r => r.category),
    };
  } catch (error) {
    console.error("获取文章标签失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取文章标签失败",
    });
  }
});
