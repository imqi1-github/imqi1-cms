import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }
  try {
    // 约定1 白名单：select 限定顶层字段，避免裸返回内部审核字段（isModification/modificationStatus/originalLinkId）
    return await prisma.links.findMany({
      select: {
        id: true,
        name: true,
        link: true,
        desc: true,
        avatar: true,
        enabled: true,
        originalLinkId: true,
        isModification: true,
        modificationStatus: true,
        originalLink: {
          select: {
            id: true,
            name: true,
            link: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取链接列表失败",
    });
  }
});
