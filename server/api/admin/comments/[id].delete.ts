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

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }

  try {
    await prisma.comment.delete({
      where: { coid: Number(id) },
    });
    return { success: true };
  } catch (error) {
    console.error("删除评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "删除评论失败",
    });
  }
});
