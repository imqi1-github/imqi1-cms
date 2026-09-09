import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
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
      message: "缺少文章 ID",
    });
  }
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 不合法",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { categoryIds, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!Array.isArray(categoryIds)) {
    throw createError({
      statusCode: 400,
      message: "categoryIds 必须是数组",
    });
  }
  // categoryIds 每个元素必须是正整数（Int mid 字段），否则 createMany 触发 Prisma/外键错误 500
  const validCategoryIds = categoryIds
    .map((mid: unknown) => (typeof mid === "number" ? mid : Number(mid)))
    .filter((mid): mid is number => Number.isInteger(mid) && mid > 0);

  // deleteMany + createMany 需原子：若 createMany 因不存在 mid 触发外键 P2003，deleteMany 已提交会丢失原有分类关系
  try {
    // 预检文章存在：cid 可能已被删除（别的标签页），此时 createMany 会触发 cid 外键 P2003，
    // 被误报为「存在无效的分类」；应明确 404「文章不存在」
    const content = await prisma.contents.findUnique({ where: { cid }, select: { cid: true } });
    if (!content) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    // 预检每个 mid 的 metas.type 为 'category'：否则分类编辑器误传标签 mid 会静默给文章加标签关系
    const categoryIdSet = new Set(validCategoryIds);
    if (categoryIdSet.size > 0) {
      const cats = await prisma.metas.findMany({
        where: { mid: { in: [...categoryIdSet] }, type: "category" },
        select: { mid: true },
      });
      if (cats.length !== categoryIdSet.size) {
        throw createError({ statusCode: 400, message: "存在无效的分类" });
      }
    }

    await prisma.$transaction(async tx => {
      // 删除现有的分类关系（只删分类，别把同表的标签关联一并删掉）
      await tx.contentrelations.deleteMany({
        where: { cid, metas: { type: "category" } },
      });

      // 创建新的分类关系
      if (validCategoryIds.length > 0) {
        await tx.contentrelations.createMany({
          data: validCategoryIds.map(mid => ({ cid, mid })),
        });
      }
    });

    // 内容关联分类变更 → 立即失效首页/分类/内容/归档 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/category/**", "/content/**", "/archiving", "/sitemap"] }).catch(err => console.error("[cache] 内容分类关联失效缓存失败", err));

    return {
      success: true,
      message: "分类更新成功",
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // categoryIds 含不存在的分类 mid → 外键 P2003 → 400
    if (error instanceof Error && "code" in error && error.code === "P2003") {
      throw createError({ statusCode: 400, message: "存在无效的分类" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新文章分类失败",
    });
  }
});
