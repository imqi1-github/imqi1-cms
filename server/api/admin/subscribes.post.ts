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

  const body = await readBody(event);

  try {
    const subscribe = await prisma.subscribe.create({
      data: {
        name: body.name,
        url: body.url,
        avatar: body.avatar || null,
      },
    });
    return subscribe;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建订阅失败",
    });
  }
});
