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
          select: { contentrelations: true },
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
        contentCount: cat._count.contentrelations,
      })),
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      data: [],
    };
  }
});
