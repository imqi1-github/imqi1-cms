import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { invalidateContentCaches } from "#server/utils/content-cache";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = (await readBody(event)) ?? {};
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
  // coid 是 Int 字段：数组内字符串/小数/null 会触发 Prisma 校验错误被吞成 500，逐元素校验为正整数
  if (!ids.every(id => Number.isInteger(id) && id > 0)) {
    throw createError({
      statusCode: 400,
      message: "评论 ID 必须为正整数",
    });
  }

  try {
    // 删除评论 + 逐文章回减计数需原子：否则中途某步抛错（文章被删/B 更新失败）评论已删、计数没跟上，
    // batch 跨多篇影响面大；包进 $transaction 保证同成功同失败
    await prisma.$transaction(async tx => {
      // 获取要删除的评论信息（用于更新文章计数）
      const commentsToDelete = await tx.comments.findMany({
        where: {
          coid: { in: ids },
        },
        select: { coid: true, cid: true, status: true },
      });

      // 删除评论
      await tx.comments.deleteMany({
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
        for (const [cid, count] of contentCommentCounts.entries()) {
          await tx.contents.update({
            where: { cid },
            data: { comment_num: { decrement: count } },
          });
        }
      }
    });

    // 评论（含数）变更 → 立即失效首页/分类/标签/详情/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/category/**", "/tag/**", "/content/**", "/archiving"] }).catch(err => console.error("[cache] 评论批量删除失效缓存失败", err));

    return {
      success: true,
      message: `成功删除 ${ids.length} 条评论`,
      count: ids.length,
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // 计数 update 时某篇文章已被删 → P2025 → 404
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        message: "评论对应的文章已被删除",
      });
    }
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
