import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const tags = await prisma.category.findMany({
      where: {
        type: "tag",
      },
      select: {
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return {
      code: 200,
      message: "获取成功",
      data: tags,
    };
  } catch (error) {
    console.error("获取标签列表失败:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "获取标签列表失败",
    });
  }
});
