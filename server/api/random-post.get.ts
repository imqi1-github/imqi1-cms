import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    // 禁用缓存（每次都要随机，不能缓存）
    setHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

    const total = await prisma.posts.count({
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

    const posts = await prisma.posts.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
      },
      skip,
      take: 1,
      include: {
        postrelations: {
          select: {
            cid: true,
            mid: true,
            metas: {
              select: {
                mid: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        // 关联的启用地点数（首页随机文章封面角标用）
        travels: {
          where: { travel: { enabled: true } },
          select: { travel_id: true },
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

    const category = post.postrelations[0]?.metas;

    const covers = parseCovers(post.covers);

    return {
      success: true,
      data: {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        covers,
        travelCount: post.travels.length,
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
