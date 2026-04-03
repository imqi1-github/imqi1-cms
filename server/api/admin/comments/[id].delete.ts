import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
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
