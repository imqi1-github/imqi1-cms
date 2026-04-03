import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少分类 ID",
    });
  }

  const body = await readBody(event);

  try {
    const category = await prisma.category.update({
      where: { mid: Number(id) },
      data: {
        name: body.name,
        desc: body.desc || null,
        class: body.class || null,
      },
    });
    return category;
  } catch (error: any) {
    if (error.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }
    throw createError({
      statusCode: 500,
      message: "更新分类失败",
    });
  }
});
