import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    // 获取所有已发布的页面
    const pages = await prisma.posts.findMany({
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

    // 获取每个分类最近5篇文章
    const categoriesWithPosts = await Promise.all(
      categories.map(async category => {
        const posts = await prisma.posts.findMany({
          where: {
            type: 0, // 文章
            status: 1, // 已发布
            postrelations: {
              some: {
                mid: category.mid,
              },
            },
          },
          orderBy: { cid: "desc" },
          take: 5,
          select: {
            cid: true,
            title: true,
            slug: true,
            create_time: true,
          },
        });

        return {
          ...category,
          posts,
        };
      })
    );

    return {
      success: true,
      data: {
        pages,
        categories: categoriesWithPosts,
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
