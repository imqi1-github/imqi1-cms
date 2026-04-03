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
    const user = await prisma.user.create({
      data: {
        name: body.name,
        mail: body.mail,
        password: body.password, // TODO: 使用 bcrypt 等库进行哈希
        role: body.role || 0,
      },
    });
    return user;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建用户失败",
    });
  }
});
