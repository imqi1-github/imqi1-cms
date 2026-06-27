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

  const id = Number(getRouterParam(event, "id"));

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: "缺少地点 ID",
    });
  }

  try {
    await prisma.travels.delete({
      where: { id },
    });
    return { success: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除旅行地点失败",
    });
  }
});
