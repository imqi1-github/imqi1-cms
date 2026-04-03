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
    const [postsCount, commentsCount, categoriesCount, usersCount] = await Promise.all([
      prisma.post.count(),
      prisma.comment.count(),
      prisma.category.count(),
      prisma.user.count(),
    ]);

    return {
      posts: postsCount,
      comments: commentsCount,
      categories: categoriesCount,
      users: usersCount,
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取统计数据失败",
    });
  }
});
