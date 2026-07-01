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
    return await prisma.subscribes.findMany();
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取订阅列表失败",
    });
  }
});
