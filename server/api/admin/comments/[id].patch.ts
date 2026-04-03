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

  const id = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }

  const { name, mail, content, status } = body;

  try {
    const comment = await prisma.comment.update({
      where: { coid: Number(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(mail !== undefined && { mail }),
        ...(content !== undefined && { content }),
        ...(status !== undefined && { status }),
      },
    });
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
