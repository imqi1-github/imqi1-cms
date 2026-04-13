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
    const posts = await prisma.post.findMany({
      where: {
        type: 0, // 0: 文章，排除页面（type=1）
      },
      take: 5,
      orderBy: { create_time: "desc" },
    });
    return posts;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取最新文章失败",
    });
  }
});
