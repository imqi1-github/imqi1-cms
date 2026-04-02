import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少评论 ID",
    });
  }

  try {
    const comment = await prisma.comment.update({
      where: { coid: Number(id) },
      data: { status: body.status || 1 },
    });
    return comment;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "更新评论失败",
    });
  }
});
