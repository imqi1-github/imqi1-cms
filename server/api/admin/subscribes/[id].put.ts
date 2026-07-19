import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateSubscribeData } from "#server/utils/validation";
import { validateCsrfToken } from "#server/utils/csrf";

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
  const { csrfToken } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

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
    console.error(error);

    // 已带 statusCode 的错误（如 validateSubscribeData 的 400）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    // 更新不存在的订阅
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "订阅不存在" });
    }

    throw createError({
      statusCode: 500,
      message: "更新订阅失败",
    });
  }
});
