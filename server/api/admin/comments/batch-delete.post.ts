import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createError({
        statusCode: 400,
        message: "请选择要删除的评论",
      });
    }

    const result = await prisma.comment.deleteMany({
      where: {
        coid: { in: ids },
      },
    });

    return {
      success: true,
      message: `成功删除 ${result.count} 条评论`,
      count: result.count,
    };
  } catch (error) {
    console.error("批量删除评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "批量删除失败",
    });
  }
});
