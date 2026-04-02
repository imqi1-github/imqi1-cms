import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少分类 ID",
    });
  }

  try {
    await prisma.category.delete({
      where: { mid: Number(id) },
    });
    return { success: true };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "删除分类失败",
    });
  }
});
