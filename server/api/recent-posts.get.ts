import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 6;

    // 获取图片分类设置
    const photoCategoryMeta = await prisma.meta.findUnique({
      where: { key: "photoCategorySlug" },
    });
    const photoCategorySlug = photoCategoryMeta?.value || "shot";

    // 获取图片分类的 mid
    const photoCategory = await prisma.category.findFirst({
      where: { slug: photoCategorySlug },
      select: { mid: true },
    });
    const photoCategoryMid = photoCategory?.mid;

    const posts = await prisma.post.findMany({
      where: {
        status: 1,
        ...(photoCategoryMid && {
          relations: {
            none: {
              mid: photoCategoryMid,
            },
          },
        }),
      },
      take: limit,
      orderBy: {
        create_time: "desc",
      },
      include: {
        relations: {
          include: {
            category: {
              select: {
                mid: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    const data = posts.map(post => {
      const categories = post.relations.map(r => ({
        name: r.category.name,
        slug: r.category.slug,
      }));

      let covers: { url: string; desc?: string }[] = [];
      if (post.covers) {
        try {
          covers = JSON.parse(post.covers);
        } catch {
          covers = [];
        }
      }

      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        covers,
        created: post.create_time,
        categories,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("获取最新文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
