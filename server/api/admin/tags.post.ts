import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateMetaData } from "#server/utils/validation";

export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);
  const { name, slug, desc, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!name || !name.trim()) {
    throw createError({
      statusCode: 400,
      message: "标签名称不能为空",
    });
  }

  // 验证字段长度
  validateMetaData({ name, slug, desc });

  try {
    const tag = await prisma.metas.create({
      data: {
        name: name.trim(),
        slug: slug || null,
        desc: desc || null,
        type: "tag",
      },
    });
    return tag;
  } catch (error) {
    console.error(error);
    if (error instanceof Error && 'code' in error && error.code === "P2002") {
      throw createError({
        statusCode: 400,
        message: "标签名称已存在",
      });
    }
    throw createError({
      statusCode: 500,
      message: "创建标签失败",
    });
  }
});
