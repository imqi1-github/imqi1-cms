import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const links = await prisma.links.findMany({
      where: {
        enabled: true,
        // 排除未审核的修改请求
        OR: [
          { isModification: false },
          { isModification: true, modificationStatus: "approved" }
        ]
      },
      // 只下发前台展示所需字段，enabled/isModification/modificationStatus/originalLinkId 等
      // 内部审核字段不对外暴露。
      select: {
        id: true,
        name: true,
        desc: true,
        link: true,
        avatar: true,
      },
    });

    // 随机打乱数组顺序 (Fisher-Yates 洗牌算法)
    for (let i = links.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [links[i]!, links[j]!] = [links[j]!, links[i]!];
    }

    return {
      code: 200,
      message: "获取友链列表成功",
      data: links
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取友链列表失败",
    });
  }
});
