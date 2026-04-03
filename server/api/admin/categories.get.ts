import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { relations: true },
        },
      },
    });

    // 返回带文章数量的分类列表
    return categories.map(cat => ({
      ...cat,
      postCount: cat._count.relations,
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取分类列表失败",
    });
  }
});
