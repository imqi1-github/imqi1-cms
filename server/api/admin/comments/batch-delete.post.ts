import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);
  const { ids, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw createError({
      statusCode: 400,
      message: "请选择要删除的评论",
    });
  }

  try {

    // 获取要删除的评论信息（用于更新文章计数）
    const commentsToDelete = await prisma.comments.findMany({
      where: {
        coid: { in: ids },
      },
      select: { coid: true, cid: true, status: true },
    });

    // 删除评论
    const result = await prisma.comments.deleteMany({
      where: {
        coid: { in: ids },
      },
    });

    // 更新文章评论计数（只统计已发布且被删除的评论）
    const publishedCommentsToDelete = commentsToDelete.filter(c => c.status === 1);

    if (publishedCommentsToDelete.length > 0) {
      // 按文章分组统计需要减少的评论数
      const contentCommentCounts = new Map<number, number>();
      publishedCommentsToDelete.forEach(comment => {
        contentCommentCounts.set(comment.cid, (contentCommentCounts.get(comment.cid) ?? 0) + 1);
      });

      // 批量更新文章评论计数
      await Promise.all(
        [...contentCommentCounts.entries()].map(([cid, count]) =>
          prisma.contents.update({
            where: { cid },
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
    console.error(error);
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
