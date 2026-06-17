import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateSubscribeData } from "#server/utils/validation";

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
      message: "缺少订阅 ID",
    });
  }

  const body = await readBody(event);

  try {
    // 验证字段长度
    validateSubscribeData({
      name: body.name,
      url: body.url,
      avatar: body.avatar,
    });

    const subscribe = await prisma.subscribes.update({
      where: { id: Number(id) },
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
      message: "更新订阅失败",
    });
  }
});
