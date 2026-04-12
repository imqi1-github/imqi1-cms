import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  // 设置缓存头 - CDN 和浏览器缓存 5 分钟
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4;

    const categories = await prisma.metas.findMany({
      where: {
        type: "category"
      },
      take: limit,
      include: {
        _count: {
          select: { postrelation: true },
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
        postCount: cat._count.postrelation,
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
