import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  // 设置缓存头 - CDN 和浏览器缓存 5 分钟
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const query = getQuery(event);

    // 公开分页参数：clamp 到正整 1..100，NaN/float/负/Infinity 不得直接传给 Prisma take
    const rawLimit = parseInt(String(query.limit ?? ""), 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 4;

    const categories = await prisma.metas.findMany({
      where: {
        type: "category"
      },
      take: limit,
      // 公开接口字段白名单：只取消费者用到的列（mid/name/slug/desc）+ 关联数，勿读全部列
      select: {
        mid: true,
        name: true,
        slug: true,
        desc: true,
        _count: {
          // 只统计已发布文章(type=0,status=1)的关联数，与 tags.get.ts 口径一致，
          // 避免把草稿/隐藏内容也算进可见数并泄露隐藏内容数量。
          select: {
            contentrelations: {
              where: { content: { type: 0, status: 1 } },
            },
          },
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
    // 未知故障统一 500，绝不把 error.message 透传给客户端
    throw createError({
      statusCode: 500,
      message: "获取分类列表失败",
    });
  }
});
