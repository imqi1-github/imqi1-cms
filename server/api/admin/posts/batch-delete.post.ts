import { prisma } from "#server/utils/prisma";
import { deleteOrphanAttachments } from "#server/utils/attachment-cleanup";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createError({
        statusCode: 400,
        message: "请选择要删除的文章",
      });
    }

    const cidList = Array.from(new Set(ids.map(id => Number(id)).filter(Number.isInteger)));
    if (cidList.length === 0) {
      throw createError({
        statusCode: 400,
        message: "文章 ID 无效",
      });
    }

    const affectedAttachments = await prisma.postattachments.findMany({
      where: {
        cid: { in: cidList },
      },
      select: { aid: true },
    });
    const affectedAttachmentIds = affectedAttachments.map(attachment => attachment.aid);

    // 删除文章关联
    await prisma.postrelations.deleteMany({
      where: {
        cid: { in: cidList },
      },
    });

    // 删除附件关联
    await prisma.postattachments.deleteMany({
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
    const result = await prisma.posts.deleteMany({
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
