import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }
  try {
    const categories = await prisma.metas.findMany({
      where: {
        type: "category",
      },
      include: {
        _count: {
          select: { postrelation: true },
        },
      },
      orderBy: {
        mid: "asc",
      },
    });

    // 返回带文章数量的分类列表
    return categories.map(cat => ({
      ...cat,
      postCount: cat._count.postrelation,
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取分类列表失败",
    });
  }
});
