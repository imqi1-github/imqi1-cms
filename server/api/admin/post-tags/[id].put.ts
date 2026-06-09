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
      message: "缺少文章 ID",
    });
  }

  try {
    const body = await readBody(event);
    const { tagIds } = body;

    if (!Array.isArray(tagIds)) {
      throw createError({
        statusCode: 400,
        message: "tagIds 必须是数组",
      });
    }

    await prisma.postrelations.deleteMany({
      where: {
        cid: Number(id),
        meta: {
          type: "tag",
        },
      },
    });

    if (tagIds.length > 0) {
      await prisma.postrelations.createMany({
        data: tagIds.map((mid: number) => ({
          cid: Number(id),
          mid,
        })),
      });
    }

    return {
      success: true,
      message: "标签更新成功",
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "更新文章标签失败",
    });
  }
});
