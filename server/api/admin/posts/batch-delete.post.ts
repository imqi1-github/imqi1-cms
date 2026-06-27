import { prisma } from "#server/utils/prisma";

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

    // 删除文章关联
    await prisma.postrelations.deleteMany({
      where: {
        cid: { in: ids },
      },
    });

    // 删除评论
    await prisma.comments.deleteMany({
      where: {
        cid: { in: ids },
      },
    });

    // 删除附件
    await prisma.attachments.deleteMany({
      where: {
        cid: { in: ids },
      },
    });

    // 删除文章
    const result = await prisma.posts.deleteMany({
      where: {
        cid: { in: ids },
      },
    });

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
