import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createError({
        statusCode: 400,
        message: "请选择要删除的评论",
      });
    }

    // 获取要删除的评论信息（用于更新文章计数）
    const commentsToDelete = await prisma.comment.findMany({
      where: {
        coid: { in: ids },
      },
      select: { coid: true, cid: true, status: true },
    });

    // 删除评论
    const result = await prisma.comment.deleteMany({
      where: {
        coid: { in: ids },
      },
    });

    // 更新文章评论计数（只统计已发布且被删除的评论）
    const publishedCommentsToDelete = commentsToDelete.filter(c => c.status === 1);

    if (publishedCommentsToDelete.length > 0) {
      // 按文章分组统计需要减少的评论数
      const postCommentCounts = {};
      publishedCommentsToDelete.forEach(comment => {
        postCommentCounts[comment.cid] = (postCommentCounts[comment.cid] || 0) + 1;
      });

      // 批量更新文章评论计数
      await Promise.all(
        Object.entries(postCommentCounts).map(([cid, count]) =>
          prisma.post.update({
            where: { cid: Number(cid) },
            data: { comment_num: { decrement: count } },
          })
        )
      );
    }

    return {
      success: true,
      message: `成功删除 ${result.count} 条评论`,
      count: result.count,
    };
  } catch (error) {
    console.error("批量删除评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
