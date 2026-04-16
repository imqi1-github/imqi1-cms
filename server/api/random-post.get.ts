import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 禁用缓存（每次都要随机，不能缓存）
    setHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

    const total = await prisma.post.count({
      where: {
        type: 0, // 0: 文章
        status: 1,
      },
    });

    if (total === 0) {
      return {
        success: false,
        data: null,
      };
    }

    const skip = Math.floor(Math.random() * total);

    const posts = await prisma.post.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
      },
      skip,
      take: 1,
      include: {
        postrelation: {
          select: {
            cid: true,
            mid: true,
            meta: {
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

    const post = posts[0];

    if (!post) {
      return {
        success: false,
        data: null,
      };
    }

    const category = post.postrelation[0]?.meta;

    let covers: { url: string; desc?: string }[] = [];
    if (post.covers) {
      try {
        covers = JSON.parse(post.covers);
      } catch {
        covers = [];
      }
    }

    return {
      success: true,
      data: {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        covers,
        category: category
          ? {
              name: category.name,
              slug: category.slug,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("获取随机文章失败:", error);
    return {
      success: false,
      data: null,
    };
  }
});
