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

  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }
  const coid = Number(id);
  if (!Number.isInteger(coid) || coid <= 0) {
    throw createError({
      statusCode: 400,
      message: "评论 ID 非法",
    });
  }

  // CSRF 验证 - 从请求头获取（避免 token 进入 URL 被日志/Referer 记录）
  const csrfToken = getHeader(event, "x-csrf-token") as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    // 删除评论与减少文章计数需原子：若只删评论、之后计数更新失败（文章已被删→P2025），
    // 评论已删但计数未减，永久失真；包进 $transaction 保证同成功同失败
    await prisma.$transaction(async tx => {
      // 获取评论信息（用于更新文章计数）
      const comment = await tx.comments.findUnique({
        where: { coid },
        select: { coid: true, cid: true, status: true },
      });

      if (!comment) {
        throw createError({
          statusCode: 404,
          message: "评论不存在",
        });
      }

      // 删除评论
      await tx.comments.delete({
        where: { coid },
      });

      // 如果删除的是已发布的评论，减少文章评论计数
      if (comment.status === 1) {
        await tx.contents.update({
          where: { cid: comment.cid },
          data: { comment_num: { decrement: 1 } },
        });
      }
    });

    return { success: true };
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) throw error;
    console.error(error);
    // 计数 update 时文章已被删 → P2025 → 404（评论已回滚，语义上视同不存在）
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }
    throw createError({
      statusCode: 500,
      message: "删除评论失败",
    });
  }
});
