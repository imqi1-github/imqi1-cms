import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateMetaData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";

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
  const mid = Number(id);
  if (!Number.isInteger(mid) || mid <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的标签 ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken, name, slug, desc } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 类型 + 空值校验：非字符串会抛 TypeError→500
  if (typeof name !== 'string' || !name.trim()) {
    throw createError({
      statusCode: 400,
      message: "标签名称不能为空",
    });
  }
  if (slug !== undefined && slug !== null && typeof slug !== 'string') {
    throw createError({ statusCode: 400, message: "标签标识格式错误" });
  }
  if (desc !== undefined && desc !== null && typeof desc !== 'string') {
    throw createError({ statusCode: 400, message: "标签描述格式错误" });
  }

  // 验证字段长度
  validateMetaData({ name, slug, desc });

  try {
    // updateMany 限定 type='tag'：metas 表同表装 category/tag，避免按 mid 直更误改同表分类
    const result = await prisma.metas.updateMany({
      where: { mid, type: "tag" },
      data: {
        name: name.trim(),
        slug: typeof slug === 'string' && slug.trim() !== '' ? slug.trim() : null,
        desc: typeof desc === 'string' && desc.trim() !== '' ? desc.trim() : null,
      },
    });
    if (result.count === 0) {
      throw createError({
        statusCode: 404,
        message: "标签不存在",
      });
    }

    const tag = await prisma.metas.findUnique({ where: { mid } });
    // 标签变更 → 立即失效首页/标签/内容/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/tag/**", "/content/**", "/archiving", "/sitemap"] }).catch(err => console.error("[cache] 标签更新失效缓存失败", err));
    // 约定1 白名单：响应节点逐字段构造（与 GET 一致），不整行返回
    return tag
      ? { mid: tag.mid, name: tag.name, slug: tag.slug, desc: tag.desc, type: tag.type }
      : null;
  } catch (error) {
    // 预期 400/404 原样抛，不打印完整堆栈
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    if (error instanceof Error && 'code' in error && error.code === "P2002") {
      throw createError({
        statusCode: 400,
        message: "标签名称或标识(slug)已存在",
      });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新标签失败",
    });
  }
});
