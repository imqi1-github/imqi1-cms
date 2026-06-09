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
      message: "缺少链接 ID",
    });
  }

  try {
    const link = await prisma.links.findUnique({
      where: { id: Number(id) },
    });

    if (!link) {
      throw createError({
        statusCode: 404,
        message: "链接不存在",
      });
    }

    const updated = await prisma.links.update({
      where: { id: Number(id) },
      data: { enabled: !link.enabled },
    });
    return updated;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "更新链接失败",
    });
  }
});
