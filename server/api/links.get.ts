import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const links = await prisma.link.findMany({
      where: {
        enabled: true
      },
      orderBy: {
        id: 'asc'
      }
    });
    return {
      code: 200,
      message: "获取友链列表成功",
      data: links
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取友链列表失败",
    });
  }
});
