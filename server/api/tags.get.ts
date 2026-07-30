import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const tags = await prisma.metas.findMany({
      where: {
        type: "tag",
      },
      select: {
        mid: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    // 统计每个标签下的已发布文章数。仅依赖 contentrelations.mid 与 content 关系
    // （与 sitemap.get.ts 同一字段集），不引用 metas 的反向关系名，规避关系键命名陷阱。
    const mids = tags.map(tag => tag.mid);
    const counted = mids.length > 0
      ? await prisma.contentrelations.groupBy({
          by: ["mid"],
          where: {
            mid: { in: mids },
            content: { type: 0, status: 1 },
          },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map<number, number>(counted.map(item => [item.mid, item._count._all]));

    // mid 仅用于查表，不随响应返回（公开接口字段白名单）
    const data = tags.map(({ mid, name, slug }) => ({
      name,
      slug,
      count: countMap.get(mid) ?? 0,
    }));

    return {
      code: 200,
      message: "获取成功",
      data,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "获取标签列表失败",
    });
  }
});
