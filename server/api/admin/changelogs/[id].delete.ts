import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少日志 ID',
    });
  }

  try {
    await prisma.changelog.delete({
      where: { id: Number(id) },
    });
    return { success: true };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: '删除更新日志失败',
    });
  }
});
