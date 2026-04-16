import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateMetaData } from "#server/utils/validation";

export default defineEventHandler(async event => {
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
      message: "缺少标签 ID",
    });
  }

  const body = await readBody(event);

  if (!body.name || !body.name.trim()) {
    throw createError({
      statusCode: 400,
      message: "标签名称不能为空",
    });
  }

  // 验证字段长度
  validateMetaData({
    name: body.name,
    slug: body.slug,
    desc: body.desc,
  });

  try {
    const tag = await prisma.meta.update({
      where: { mid: Number(id) },
      data: {
        name: body.name.trim(),
        slug: body.slug || null,
        desc: body.desc || null,
      },
    });
    return tag;
  } catch (error: any) {
    if (error.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "标签不存在",
      });
    }
    if (error.code === "P2002") {
      throw createError({
        statusCode: 400,
        message: "标签名称已存在",
      });
    }
    throw createError({
      statusCode: 500,
      message: "更新标签失败",
    });
  }
});
