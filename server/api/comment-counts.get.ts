import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const cids = query.cids ? (query.cids as string).split(',').map(Number) : [];

    if (cids.length === 0) {
      return {
        success: false,
        data: {},
      };
    }

    // 禁用缓存（评论数需要实时）
    setHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

    // 批量获取文章的评论数
    const posts = await prisma.posts.findMany({
      where: {
        cid: { in: cids },
      },
      select: {
        cid: true,
        comment_num: true,
      },
    });

    // 转换为对象 { cid: comment_num }
    const commentCounts = posts.reduce((acc, post) => {
      acc[post.cid] = post.comment_num || 0;
      return acc;
    }, {} as Record<number, number>);

    return {
      success: true,
      data: commentCounts,
    };
  } catch (error) {
    console.error("获取评论数失败:", error);
    return {
      success: false,
      data: {},
    };
  }
});
