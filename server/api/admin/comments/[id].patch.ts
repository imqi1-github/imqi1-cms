import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCommentData } from "#server/utils/validation";

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
  const body = await readBody(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }

  const { name, mail, link, content, status } = body;

  // 验证字段长度
  if (name !== undefined || mail !== undefined) {
    validateCommentData({ name, mail });
  }

  try {
    // 获取原评论信息（用于比较状态变化）
    const oldComment = await prisma.comment.findUnique({
      where: { coid: Number(id) },
      select: { coid: true, cid: true, status: true },
    });

    if (!oldComment) {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }

    const comment = await prisma.comment.update({
      where: { coid: Number(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(mail !== undefined && { mail }),
        ...(link !== undefined && { link }),
        ...(content !== undefined && { content }),
        ...(status !== undefined && { status }),
      },
    });

    // 如果状态发生变化，更新文章评论计数
    if (status !== undefined && status !== oldComment.status) {
      // 从非已发布变为已发布：增加计数
      if (status === 1 && oldComment.status !== 1) {
        await prisma.post.update({
          where: { cid: oldComment.cid },
          data: { comment_num: { increment: 1 } },
        });
      }
      // 从已发布变为非已发布：减少计数
      else if (status !== 1 && oldComment.status === 1) {
        await prisma.post.update({
          where: { cid: oldComment.cid },
          data: { comment_num: { decrement: 1 } },
        });
      }
    }

    return {
      success: true,
      data: comment,
    };
  } catch (error) {
    console.error("更新评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "更新评论失败",
    });
  }
});
