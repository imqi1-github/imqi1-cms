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
      // 固定基础顺序：洗牌结果才可复现（否则同一天两次查询也可能不同）
      orderBy: { id: "asc" },
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

    // 服务端保持稳定顺序（前端水合后再随机打乱）→ SSR HTML/ETag 稳定，边缘缓存才有效
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
