import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少文章 ID",
    });
  }

  const body = await readBody(event);
  const categoryIds = body.categoryIds as number[] || [];

  try {
    const postId = Number(id);

    // 先删除现有的分类关系
    await prisma.postRelation.deleteMany({
      where: { cid: postId },
    });

    // 创建新的分类关系
    if (categoryIds.length > 0) {
      const relations = categoryIds.map(mid => ({
        cid: postId,
        mid,
      }));
      await prisma.postRelation.createMany({
        data: relations,
      });
    }

    return {
      success: true,
      message: "分类更新成功",
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "更新文章分类失败",
    });
  }
});
