import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少文章 ID",
    });
  }

  try {
    const relations = await prisma.postRelation.findMany({
      where: { cid: Number(id) },
      include: {
        category: true,
      },
    });

    return {
      success: true,
      data: relations.map(r => r.category),
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取文章分类失败",
    });
  }
});
