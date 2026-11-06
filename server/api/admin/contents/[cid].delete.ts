import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { deleteOrphanAttachments } from "#server/utils/attachment-cleanup";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { contentUrlPaths } from "#server/utils/content-urls";
import { logAdminAudit } from "#server/utils/audit";
import { CSRF_HEADER, CONTENT_CACHE_ROUTES, LIST_EDGE_DIRECTORIES } from "#shared/constants";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  // CSRF 验证（DELETE 从 header 读取 token）
  const csrfToken = getHeader(event, CSRF_HEADER) as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 获取路由参数 - 使用 cid 匹配文件名 [cid].delete.ts
  const cid = getRouterParam(event, "cid");

  if (!cid) {
    throw createError({
      statusCode: 400,
      message: "缺少文章 ID",
    });
  }

  const contentId = Number(cid);
  if (!Number.isInteger(contentId) || contentId <= 0) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 无效",
    });
  }

  try {
    const target = await prisma.contents.findUnique({
      where: { cid: contentId },
      select: {
        cid: true,
        title: true,
        status: true,
        type: true,
        slug: true,
        contentrelations: { select: { metas: { select: { slug: true, type: true } } } },
      },
    });

    const affectedAttachments = await prisma.contentattachments.findMany({
      where: { cid: contentId },
      select: { aid: true },
    });

    await prisma.contents.delete({
      where: { cid: contentId },
    });

    await deleteOrphanAttachments(affectedAttachments.map(attachment => attachment.aid));

    // 删除后 cid 已查不到，URL 必须删除前算好，避免退回目录刷新
    const contentPaths = target
      ? [...contentUrlPaths(target), `/api/related-contents/${contentId}`]
      : [];
    // 删除文章 → 后续文章页码整体位移 → 刷整个列表目录
    void invalidateContentCaches({ routes: CONTENT_CACHE_ROUTES, contentPaths, edgeDirectories: LIST_EDGE_DIRECTORIES }).catch(err => console.error("[cache] 文章删除失效缓存失败", err));

    logAdminAudit({
      actor: { uid: user.uid, name: user.name },
      action: "content.delete",
      target: { type: "content", id: contentId },
      diff: target
        ? { title: target.title.slice(0, 30), status: target.status, type: target.type, attachments: affectedAttachments.length }
        : { attachments: affectedAttachments.length },
    });

    return { success: true };
  } catch (error) {
    // 删除不存在的文章（预期 404，先于 console.error，免得打印预期 4xx 堆栈）
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除文章失败",
    });
  }
});
