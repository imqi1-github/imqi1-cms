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

  // CSRF 验证（DELETE 从 header 读取 token）
  const csrfToken = getHeader(event, "x-csrf-token") as string;
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
  if (!Number.isInteger(contentId)) {
    throw createError({
      statusCode: 400,
      message: "文章 ID 无效",
    });
  }

  try {
    const affectedAttachments = await prisma.contentattachments.findMany({
      where: { cid: contentId },
      select: { aid: true },
    });

    await prisma.contents.delete({
      where: { cid: contentId },
    });

    await deleteOrphanAttachments(affectedAttachments.map(attachment => attachment.aid));

    return { success: true };
  } catch (error) {
    console.error(error);

    // 删除不存在的文章
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    throw createError({
      statusCode: 500,
      message: "删除文章失败",
    });
  }
});
