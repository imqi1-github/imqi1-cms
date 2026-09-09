import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { deleteOrphanAttachments } from "#server/utils/attachment-cleanup";
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

  const body = (await readBody(event)) ?? {};
  const { ids, csrfToken } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw createError({
      statusCode: 400,
      message: "请选择要删除的文章",
    });
  }

  // 严格校验每个元素为正整数：Number(true)=1、Number(null)/''=0、负数都会误删非目标记录；
  // 只有 Number.isSafeInteger(n) && n>0 才放行
  const cidList = Array.from(
    new Set(
      ids
        .map((id: unknown) => (typeof id === "number" ? id : Number(id)))
        .filter((n): n is number => Number.isSafeInteger(n) && n > 0),
    ),
  );
  if (cidList.length === 0) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 无效",
    });
  }

  try {
    const affectedAttachments = await prisma.contentattachments.findMany({
      where: {
        cid: { in: cidList },
      },
      select: { aid: true },
    });
    const affectedAttachmentIds = affectedAttachments.map(attachment => attachment.aid);

    // 四个 deleteMany 包进事务：任一步失败整体回滚，避免「关系/评论/附件已删而文章还在」的脏状态
    await prisma.$transaction([
      prisma.contentrelations.deleteMany({
        where: {
          cid: { in: cidList },
        },
      }),
      prisma.contentattachments.deleteMany({
        where: {
          cid: { in: cidList },
        },
      }),
      prisma.comments.deleteMany({
        where: {
          cid: { in: cidList },
        },
      }),
      prisma.contents.deleteMany({
        where: {
          cid: { in: cidList },
        },
      }),
    ]);

    // 物理文件删除不可入 DB 事务，放到事务提交后执行
    await deleteOrphanAttachments(affectedAttachmentIds);

    // 文章变更 → 立即失效首页/分类/标签/归档/详情 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/category/**", "/tag/**", "/archiving", "/content/**", "/sitemap"] }).catch(err => console.error("[cache] 文章批量删除失效缓存失败", err));

    return {
      success: true,
      message: `成功删除 ${cidList.length} 篇文章`,
      count: cidList.length,
    };
  } catch (error) {
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
