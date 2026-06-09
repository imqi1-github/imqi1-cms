import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

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
    const links = await prisma.links.findMany({
      include: {
        // 包含原友链信息（如果是修改请求）
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

    return links;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取链接列表失败",
    });
  }
});
