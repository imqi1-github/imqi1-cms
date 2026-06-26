import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";
import {validateLinkData} from "#server/utils/validation";

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

  const body = await readBody(event);

  try {
    // 验证字段长度
    validateLinkData({
      name: body.name,
      link: body.link,
      desc: body.desc,
      avatar: body.avatar,
    });

    // 检查链接是否存在
    const link = await prisma.links.findUnique({
      where: { id: Number(id) },
    });

    if (!link) {
      throw createError({
        statusCode: 404,
        message: "链接不存在",
      });
    }

    // 更新链接
    return await prisma.links.update({
      where: {id: Number(id)},
      data: {
        name: body.name,
        link: body.link,
        desc: body.desc,
        avatar: body.avatar,
        enabled: body.enabled,
      },
    });
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "更新链接失败",
    });
  }
});
