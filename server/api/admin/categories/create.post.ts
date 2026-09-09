import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateMetaData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";

export default defineEventHandler(async event => {
  // 鉴权与 CSRF 放 try 块外：安全不变式不应进入会吞错的 catch
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  // readBody 对空/非对象 body 可能返回 null/undefined，先兜底再解构
  const body = (await readBody(event)) ?? {};
  const { name, slug, desc, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 读入字段类型收窄：非字符串直接 .trim() 会抛 TypeError（name/slug/desc）
  if (typeof name !== 'string') {
    throw createError({
      statusCode: 400,
      message: "分类名称格式错误",
    });
  }
  if (slug !== undefined && typeof slug !== 'string') {
    throw createError({
      statusCode: 400,
      message: "分类标识格式错误",
    });
  }
  if (desc !== undefined && typeof desc !== 'string') {
    throw createError({
      statusCode: 400,
      message: "分类描述格式错误",
    });
  }

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

    // 检查分类名称是否已存在
    const existingByName = await prisma.metas.findFirst({
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
      const existingBySlug = await prisma.metas.findFirst({
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
    const category = await prisma.metas.create({
      data: {
        name: name.trim(),
        slug: slug && slug.trim() !== "" ? slug.trim() : null,
        desc: desc && desc.trim() !== "" ? desc.trim() : null,
        type: "category",
      },
    });

    // 分类变更 → 立即失效首页/分类/内容/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/category/**", "/content/**", "/archiving", "/sitemap"] }).catch(err => console.error("[cache] 分类创建失效缓存失败", err));

    return {
      success: true,
      data: {
        mid: category.mid,
        name: category.name,
        slug: category.slug,
        desc: category.desc,
      },
    };
  } catch (error) {
    // 先重抛带 statusCode 的错误（400/403/401），再对真正的意外错误 console.error
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    console.error(error);

    // 处理 Prisma 唯一约束冲突
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
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
