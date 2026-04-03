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
    const link = await prisma.link.create({
      data: {
        name: body.name,
        link: body.link,
        desc: body.desc || null,
        avatar: body.avatar || null,
      },
    });
    return link;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "创建链接失败",
    });
  }
});
