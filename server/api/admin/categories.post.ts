import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

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
    const category = await prisma.metas.create({
      data: {
        name: body.name,
        slug: body.slug || null,
        desc: body.desc || null,
        type: "category",
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
