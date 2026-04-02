import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const body = await readBody(event);
  try {
    const link = await prisma.link.create({
      data: {
        name: body.name,
        link: body.link,
        desc: body.desc || null,
        avatar: body.avatar || null,
      },
    });
    return link;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建链接失败",
    });
  }
});
