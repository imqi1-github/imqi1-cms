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
  try {
    const tags = await prisma.category.findMany({
      where: {
        type: "tag",
      },
      include: {
        _count: {
          select: { postrelation: true },
        },
      },
      orderBy: {
        mid: "asc",
      },
    });

    return tags.map(tag => ({
      ...tag,
      postCount: tag._count.postrelation,
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取标签列表失败",
    });
  }
});
