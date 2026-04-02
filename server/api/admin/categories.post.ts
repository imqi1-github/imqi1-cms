import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const body = await readBody(event);
  try {
    const category = await prisma.category.create({
      data: {
        name: body.name,
        desc: body.desc || null,
        class: body.class || null,
      },
    });
    return category;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建分类失败",
    });
  }
});
