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
    const category = await prisma.category.create({
      data: {
        name: body.name,
        desc: body.desc || null,
        class: body.class || null,
      },
    });
    return category;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建分类失败",
    });
  }
});
