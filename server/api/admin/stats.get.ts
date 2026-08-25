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
    const [contentsCount, pagesCount, commentsCount, categoriesCount, usersCount] = await Promise.all([
      prisma.contents.count({ where: { type: 0 } }), // 文章数
      prisma.contents.count({ where: { type: 1 } }), // 页面数
      prisma.comments.count(),
      prisma.metas.count({ where: { type: "category" } }), // 分类数（metas 同表装 tag，须限定 category 防止把标签计入）
      prisma.users.count(),
    ]);

    return {
      contents: contentsCount,
      pages: pagesCount,
      comments: commentsCount,
      categories: categoriesCount,
      users: usersCount,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取统计数据失败",
    });
  }
});
