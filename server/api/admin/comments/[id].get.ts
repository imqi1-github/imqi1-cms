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
    const comment = await prisma.comment.findUnique({
      where: { coid: Number(id) },
      include: {
        post: {
          select: {
            cid: true,
            title: true,
          },
        },
      },
    });

    if (!comment) {
      throw createError({
        statusCode: 404,
        message: "评论不存在",
      });
    }

    return {
      success: true,
      data: comment,
    };
  } catch (error) {
    console.error("获取评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取评论失败",
    });
  }
});
