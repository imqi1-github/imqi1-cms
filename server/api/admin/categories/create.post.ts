import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  try {
    // 验证用户登录
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

    // 验证必填字段
    if (!name || name.trim() === "") {
      throw createError({
        statusCode: 400,
        message: "分类名称不能为空",
      });
    }

    // 检查分类名称是否已存在
    const existingByName = await prisma.meta.findFirst({
      where: {
        name: name.trim(),
        type: "category",
      },
    });

    if (existingByName) {
      throw createError({
        statusCode: 400,
        message: "分类名称已存在",
      });
    }

    // 如果提供了 slug，检查是否已存在
    if (slug && slug.trim() !== "") {
      const existingBySlug = await prisma.meta.findFirst({
        where: {
          slug: slug.trim(),
          type: "category",
        },
      });

      if (existingBySlug) {
        throw createError({
          statusCode: 400,
          message: "分类标识已存在",
        });
      }
    }

    // 创建分类
    const category = await prisma.meta.create({
      data: {
        name: name.trim(),
        slug: slug && slug.trim() !== "" ? slug.trim() : null,
        desc: desc && desc.trim() !== "" ? desc.trim() : null,
        type: "category",
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
    console.error("创建分类失败:", {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    });

    // 如果是我们抛出的错误，直接传递
    if (error.statusCode) {
      throw error;
    }

    // 处理 Prisma 唯一约束冲突
    if (error.code === 'P2002') {
      throw createError({
        statusCode: 400,
        message: "分类名称或标识已存在",
      });
    }

    // 其他未知错误
    throw createError({
      statusCode: 500,
      message: "创建分类失败，请稍后重试",
    });
  }
});
