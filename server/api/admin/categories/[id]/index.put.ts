import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateMetaData } from "#server/utils/validation";

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
      message: "缺少分类 ID",
    });
  }

  const body = await readBody(event);
  const { csrfToken, ...updateData } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const { name, slug, desc } = updateData;

  // 验证必填字段
  if (!name || name.trim() === "") {
    throw createError({
      statusCode: 400,
      message: "分类名称不能为空",
    });
  }

  // 验证字段长度
  validateMetaData({ name, slug, desc });

  try {
    // 检查分类是否存在
    const existingCategory = await prisma.metas.findUnique({
      where: { mid: Number(id) },
    });

    if (!existingCategory) {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }

    // 检查分类名称是否被其他分类占用
    const existingByName = await prisma.metas.findFirst({
      where: {
        name: name.trim(),
        type: "category",
        mid: { not: Number(id) },
      },
    });

    if (existingByName) {
      throw createError({
        statusCode: 400,
        message: "分类名称已存在",
      });
    }

    // 如果提供了 slug，检查是否被其他分类占用
    if (slug && slug.trim() !== "") {
      const existingBySlug = await prisma.metas.findFirst({
        where: {
          slug: slug.trim(),
          type: "category",
          mid: { not: Number(id) },
        },
      });

      if (existingBySlug) {
        throw createError({
          statusCode: 400,
          message: "分类标识已存在",
        });
      }
    }

    // 更新分类
    const category = await prisma.metas.update({
      where: { mid: Number(id) },
      data: {
        name: name.trim(),
        slug: slug && slug.trim() !== "" ? slug.trim() : null,
        desc: desc && desc.trim() !== "" ? desc.trim() : null,
      },
    });

    return {
      success: true,
      data: {
        mid: category.mid,
        name: category.name,
        slug: category.slug,
        desc: category.desc,
      },
    };
  } catch (error: any) {
    // 如果是我们抛出的错误，直接传递
    if (error.statusCode) {
      throw error;
    }

    // 记录详细的错误信息
    console.error(error);

    throw createError({
      statusCode: 500,
      message: "更新分类失败: " + (error.message || "未知错误"),
    });
  }
});
