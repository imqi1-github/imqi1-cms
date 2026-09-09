import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateMetaData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";

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
  const mid = Number(id);
  if (!Number.isInteger(mid) || mid <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的分类 ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken, ...updateData } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const { name, slug, desc } = updateData;

  // 读入字段做类型收窄：readBody 无运行时校验，非字符串直接 .trim() 会抛 TypeError（且在 try 外）
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
    // 检查分类是否存在 —— 必须限定 type='category'，否则传 tag 的 mid 会把 tag 当分类改掉
    const existingCategory = await prisma.metas.findFirst({
      where: { mid, type: "category" },
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
        mid: { not: mid },
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
          mid: { not: mid },
        },
      });

      if (existingBySlug) {
        throw createError({
          statusCode: 400,
          message: "分类标识已存在",
        });
      }
    }

    // 更新分类。区分「未提供」与「清空」：字段为 undefined 时保留原值，显式空串才算清空，
    // 避免只改 name 而未传 slug/desc 时被整体置 null（部分更新丢数据）
    const category = await prisma.metas.update({
      where: { mid },
      data: {
        name: name.trim(),
        slug: slug === undefined ? existingCategory.slug : (slug && slug.trim() !== "" ? slug.trim() : null),
        desc: desc === undefined ? existingCategory.desc : (desc && desc.trim() !== "" ? desc.trim() : null),
      },
    });

    // 分类变更 → 立即失效首页/分类/内容/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/category/**", "/content/**", "/archiving", "/sitemap"] }).catch(err => console.error("[cache] 分类更新失效缓存失败", err));

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
    // 如果是我们抛出的错误，直接传递
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    // 预检（findUnique）与 update 之间存在并发窗口：记录被删时 update 抛 P2025 → 404 而非 500
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }

    // 并发编辑/抢注时 name/slug 唯一约束冲突（P2002）→ 400 而非 500
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      throw createError({
        statusCode: 400,
        message: "分类名称或标识(slug)已存在",
      });
    }

    // 记录详细的错误信息
    console.error(error);

    throw createError({
      statusCode: 500,
      message: "更新分类失败",
    });
  }
});
