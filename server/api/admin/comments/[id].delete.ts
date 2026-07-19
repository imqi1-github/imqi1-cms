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

  // CSRF 验证 - 从请求头获取（避免 token 进入 URL 被日志/Referer 记录）
  const csrfToken = getHeader(event, "x-csrf-token") as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    // 获取评论信息（用于更新文章计数）
    const comment = await prisma.comments.findUnique({
      where: { coid: Number(id) },
      select: { coid: true, cid: true, status: true },
    });

    if (!comment) {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }

    // 删除评论
    await prisma.comments.delete({
      where: { coid: Number(id) },
    });

    // 如果删除的是已发布的评论，减少文章评论计数
    if (comment.status === 1) {
      await prisma.contents.update({
        where: { cid: comment.cid },
        data: { comment_num: { decrement: 1 } },
      });
    }

    return { success: true };
  } catch (error) {
    console.error(error);
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createError({
      statusCode: 500,
      message: "删除评论失败",
    });
  }
});
