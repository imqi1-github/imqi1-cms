import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4;

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

    if (!photoCategory) {
      return {
        success: false,
        data: [],
      };
    }

    const posts = await prisma.post.findMany({
      where: {
        status: 1,
        relations: {
          some: {
            mid: photoCategory.mid,
          },
        },
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
        covers,
        created: post.create_time,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("获取图片文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
