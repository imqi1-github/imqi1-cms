import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const links = await prisma.link.findMany({
      where: {
        enabled: true
      }
    });

    // 随机打乱数组顺序 (Fisher-Yates 洗牌算法)
    for (let i = links.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [links[i], links[j]] = [links[j], links[i]];
    }

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
