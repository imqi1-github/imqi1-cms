import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateLinkData } from "#server/utils/validation";

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
    // 验证字段长度
    validateLinkData({
      name: body.name,
      link: body.link,
      desc: body.desc,
      avatar: body.avatar,
    });

    const link = await prisma.links.create({
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
