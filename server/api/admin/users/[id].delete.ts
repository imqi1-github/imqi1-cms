import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少用户 ID",
    });
  }

  try {
    await prisma.user.delete({
      where: { id: Number(id) },
    });
    return { success: true };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "删除用户失败",
    });
  }
});
