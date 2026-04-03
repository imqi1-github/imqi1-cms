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
    const links = await prisma.link.findMany();
    return links;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取链接列表失败",
    });
  }
});
