import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取所有已发布的文章（type=0），包含分类信息
    const posts = await prisma.post.findMany({
      where: {
        status: 1,
        type: 0,
      },
      include: {
        postrelation: {
            select: {
              cid: true,
              mid: true,
              meta: {
              select: {
                slug: true,
              },
            },
          },
        },
      },
      orderBy: {
        create_time: "desc",
      },
    });

    // 按年月分组
    const grouped = posts.reduce((acc, post) => {
      const date = new Date(post.create_time);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;

      if (!acc[key]) {
        acc[key] = {
          year,
          month,
          posts: [],
        };
      }

      // 获取第一个分类的 slug
      const categorySlug = post.postrelation && post.postrelation.length > 0
        ? post.postrelation[0].meta?.slug
        : null;

      acc[key].posts.push({
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        categorySlug,
        createTime: post.create_time,
      });

      return acc;
    }, {} as Record<string, { year: number; month: number; posts: any[] }>);

    // 转换为数组并按日期排序
    const sortedGroups = Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    // 统计信息
    const stats = {
      total: posts.length,
      firstDate: posts.length > 0 ? posts[posts.length - 1].create_time : null,
      lastDate: posts.length > 0 ? posts[0].create_time : null,
    };

    return {
      success: true,
      data: {
        groups: sortedGroups,
        stats,
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取归档失败",
    });
  }
});
