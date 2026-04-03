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
    const changelogs = await prisma.changelog.findMany({
      orderBy: { create_time: "desc" },
    });
    return changelogs;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
