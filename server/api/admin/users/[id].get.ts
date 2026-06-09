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

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少用户 ID",
    });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { uid: Number(id) },
      select: {
        uid: true,
        name: true,
        nickname: true,
        mail: true,
        avatar: true,
        role: true,
        create: true,
      },
    });

    if (!user) {
      throw createError({
        statusCode: 404,
        message: "用户不存在",
      });
    }

    return user;
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "获取用户失败",
    });
  }
});
