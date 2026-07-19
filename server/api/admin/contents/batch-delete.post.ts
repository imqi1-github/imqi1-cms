import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { deleteOrphanAttachments } from "#server/utils/attachment-cleanup";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);
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

  const cidList = Array.from(new Set(ids.map((id: unknown) => Number(id)).filter(Number.isInteger)));
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

    // 删除文章关联
    await prisma.contentrelations.deleteMany({
      where: {
        cid: { in: cidList },
      },
    });

    // 删除附件关联
    await prisma.contentattachments.deleteMany({
      where: {
        cid: { in: cidList },
      },
    });

    // 删除评论
    await prisma.comments.deleteMany({
      where: {
        cid: { in: cidList },
      },
    });

    // 删除文章
    const result = await prisma.contents.deleteMany({
      where: {
        cid: { in: cidList },
      },
    });

    await deleteOrphanAttachments(affectedAttachmentIds);

    return {
      success: true,
      message: `成功删除 ${result.count} 篇文章`,
      count: result.count,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
