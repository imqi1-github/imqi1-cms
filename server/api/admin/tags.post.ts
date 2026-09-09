import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
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

  const body = (await readBody(event)) ?? {};
  const { name, slug, desc, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 类型 + 空值校验：非字符串 truthy（如 name:123）会让 name.trim() 抛 TypeError→500
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
    const tag = await prisma.metas.create({
      data: {
        name: name.trim(),
        slug: typeof slug === 'string' && slug.trim() !== '' ? slug.trim() : null,
        desc: typeof desc === 'string' && desc.trim() !== '' ? desc.trim() : null,
        type: "tag",
      },
    });
    // 标签变更 → 立即失效首页/标签/内容/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/tag/**", "/content/**", "/archiving", "/sitemap"] }).catch(err => console.error("[cache] 标签创建失效缓存失败", err));
    return tag;
  } catch (error) {
    // P2002 重名是预期 4xx，不打印完整堆栈
    if (error instanceof Error && 'code' in error && error.code === "P2002") {
      // metas 表 name 与 slug 均 @unique，冲突可能是任一字段：给出通用文案
      throw createError({
        statusCode: 400,
        message: "标签名称或标识(slug)已存在",
      });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "创建标签失败",
    });
  }
});
