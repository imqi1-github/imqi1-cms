import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const categories = await prisma.category.findMany();
    return categories;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取分类列表失败",
    });
  }
});
