import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const subscribes = await prisma.subscribe.findMany();
    return subscribes;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取订阅列表失败",
    });
  }
});
