import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

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
      message: "缺少标签 ID",
    });
  }

  const tagId = Number(id);

  try {
    const tagToDelete = await prisma.metas.findUnique({
      where: { mid: tagId },
    });

    if (!tagToDelete) {
      throw createError({
        statusCode: 404,
        message: "标签不存在",
      });
    }

    if (tagToDelete.type !== "tag") {
      throw createError({
        statusCode: 400,
        message: "只能删除标签类型",
      });
    }

    await prisma.postrelations.deleteMany({
      where: { mid: tagId },
    });

    await prisma.metas.delete({
      where: { mid: tagId },
    });

    return { success: true };
  } catch (error) {
    console.error(error);
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "删除标签失败",
    });
  }
});
