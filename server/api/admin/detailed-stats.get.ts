import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    // 并行查询所有统计数据
    const [
      contentsCount,
      pagesCount,
      publishedContentsCount,
      draftContentsCount,
      thisMonthContentsCount,
      thisWeekContentsCount,
      commentsCount,
      pendingCommentsCount,
      thisMonthCommentsCount,
      categoriesCount,
      tagsCount,
      usersCount,
    ] = await Promise.all([
      // 文章统计
      prisma.contents.count({ where: { type: 0 } }),
      prisma.contents.count({ where: { type: 1 } }),
      prisma.contents.count({ where: { type: 0, status: 1 } }), // status: 1 表示已发布
      prisma.contents.count({ where: { type: 0, status: 0 } }), // status: 0 表示草稿
      prisma.contents.count({
        where: {
          type: 0,
          create_time: { gte: startOfMonth },
        },
      }),
      prisma.contents.count({
        where: {
          type: 0,
          create_time: { gte: startOfWeek },
        },
      }),

      // 评论统计
      prisma.comments.count(),
      prisma.comments.count({ where: { status: 0 } }), // status: 0 表示待审核
      prisma.comments.count({
        where: {
          create_time: { gte: startOfMonth },
        },
      }),

      // 分类和标签统计
      prisma.metas.count({ where: { type: 'category' } }),
      prisma.metas.count({ where: { type: 'tag' } }),

      // 用户统计
      prisma.users.count(),
    ]);

    return {
      contents: {
        total: contentsCount,
        published: publishedContentsCount,
        draft: draftContentsCount,
        thisMonth: thisMonthContentsCount,
        thisWeek: thisWeekContentsCount,
      },
      pages: {
        total: pagesCount,
      },
      comments: {
        total: commentsCount,
        pending: pendingCommentsCount,
        thisMonth: thisMonthCommentsCount,
      },
      categories: {
        total: categoriesCount,
      },
      tags: {
        total: tagsCount,
      },
      users: {
        total: usersCount,
        online: 0, // 暂不支持在线用户统计
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取详细统计数据失败",
    });
  }
});
