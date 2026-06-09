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
    // 获取评论数最多的文章作为热门文章
    const popularPosts = await prisma.posts.findMany({
      where: {
        type: 0, // 只查询文章
        comment_num: {
          gt: 0, // 只显示有评论的文章
        },
      },
      take: 5,
      orderBy: { comment_num: "desc" },
      select: {
        cid: true,
        title: true,
        comment_num: true,
        create_time: true,
      },
    });

    // 格式化返回数据
    return popularPosts.map(post => ({
      cid: post.cid,
      title: post.title,
      views: post.comment_num, // 使用评论数作为热度指标
      commentsCount: post.comment_num,
      create_time: post.create_time,
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取热门文章失败",
    });
  }
});
