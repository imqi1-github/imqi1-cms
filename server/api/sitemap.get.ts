import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    // 获取所有已发布的页面
    const pages = await prisma.contents.findMany({
      where: {
        type: 1, // 1: 页面
        status: 1, // 已发布
      },
      orderBy: { cid: "asc" },
      select: {
        cid: true,
        title: true,
        slug: true,
      },
    });

    // 获取所有分类
    const categories = await prisma.metas.findMany({
      where: {
        type: "category",
      },
      orderBy: { mid: "asc" },
      select: {
        mid: true,
        name: true,
        slug: true,
      },
    });

    // 单次查询取所有分类下的已发布文章关系（避免按分类逐个 findMany 的 N+1），
    // 按 cid 降序拉取后在内存按分类分组，每类截断最近 5 篇
    const categoryMids = categories.map(c => c.mid);
    const relations = categoryMids.length > 0
      ? await prisma.contentrelations.findMany({
          where: {
            mid: { in: categoryMids },
            content: {
              type: 0, // 文章
              status: 1, // 已发布
            },
          },
          orderBy: { cid: "desc" },
          select: {
            mid: true,
            content: {
              select: {
                cid: true,
                title: true,
                slug: true,
                create_time: true,
              },
            },
          },
        })
      : [];

    const CONTENTS_PER_CATEGORY = 5;
    const contentsByMid = new Map<number, typeof relations[number]["content"][]>();
    for (const relation of relations) {
      const bucket = contentsByMid.get(relation.mid);
      if (bucket) {
        if (bucket.length < CONTENTS_PER_CATEGORY) bucket.push(relation.content);
      } else {
        contentsByMid.set(relation.mid, [relation.content]);
      }
    }

    const categoriesWithContents = categories.map(category => ({
      ...category,
      contents: contentsByMid.get(category.mid) ?? [],
    }));

    return {
      success: true,
      data: {
        pages,
        categories: categoriesWithContents,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取站点地图失败",
    });
  }
});
