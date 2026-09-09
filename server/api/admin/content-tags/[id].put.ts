import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { validateCsrfToken } from "#server/utils/csrf";
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
  const { tagIds, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!Array.isArray(tagIds)) {
    throw createError({
      statusCode: 400,
      message: "tagIds 必须是数组",
    });
  }
  // tagIds 每个元素必须是正整数（Int mid 字段），否则 createMany 触发 Prisma/外键错误 500
  const validTagIds = tagIds
    .map((mid: unknown) => (typeof mid === "number" ? mid : Number(mid)))
    .filter((mid): mid is number => Number.isInteger(mid) && mid > 0);

  // deleteMany + createMany 需原子：若 createMany 因不存在 mid 触发外键 P2003，deleteMany 已提交会丢失原标签关系
  try {
    // 预检文章存在：cid 可能已被删除（别的标签页），此时 createMany 会触发 cid 外键 P2003，
    // 被误报为「标签不存在」；应明确 404「文章不存在」
    const content = await prisma.contents.findUnique({ where: { cid }, select: { cid: true } });
    if (!content) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    // 预检每个 mid 的 metas.type 为 'tag'：否则编辑器误传分类 mid 会静默给文章加分类关系
    const tagIdSet = new Set(validTagIds);
    if (tagIdSet.size > 0) {
      const tags = await prisma.metas.findMany({
        where: { mid: { in: [...tagIdSet] }, type: "tag" },
        select: { mid: true },
      });
      if (tags.length !== tagIdSet.size) {
        throw createError({ statusCode: 400, message: "存在无效的标签" });
      }
    }

    await prisma.$transaction(async tx => {
      await tx.contentrelations.deleteMany({
        where: {
          cid,
          metas: {
            type: "tag",
          },
        },
      });

      if (validTagIds.length > 0) {
        await tx.contentrelations.createMany({
          data: validTagIds.map(mid => ({ cid, mid })),
        });
      }
    });

    // 内容关联标签变更 → 立即失效首页/标签/内容 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/tag/**", "/content/**", "/sitemap"] }).catch(err => console.error("[cache] 内容标签关联失效缓存失败", err));

    return {
      success: true,
      message: "标签更新成功",
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // tagIds 含不存在的标签 mid → 外键 P2003 → 400（与 content-categories 的 400 语义一致；P2003 是非法输入非资源缺失）
    if (error instanceof Error && "code" in error && error.code === "P2003") {
      throw createError({ statusCode: 400, message: "存在无效的标签" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新文章标签失败",
    });
  }
});
