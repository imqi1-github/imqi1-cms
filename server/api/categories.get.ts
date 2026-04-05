import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4;

    const categories = await prisma.category.findMany({
      take: limit,
      include: {
        _count: {
          select: { relations: true },
        },
      },
      orderBy: {
        mid: "asc",
      },
    });

    return {
      success: true,
      data: categories.map(cat => ({
        mid: cat.mid,
        name: cat.name,
        slug: cat.slug,
        desc: cat.desc,
        postCount: cat._count.relations,
      })),
    };
  } catch (error) {
    console.error("获取分类失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
