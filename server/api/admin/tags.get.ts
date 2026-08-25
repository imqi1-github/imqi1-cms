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
    // 标签数量有限，保留数组形状（前端 tags.vue 直接消费为数组）；加 take 上限防无界全表
    const tags = await prisma.metas.findMany({
      where: {
        type: "tag",
      },
      include: {
        _count: {
          select: { contentrelations: true },
        },
      },
      orderBy: {
        mid: "asc",
      },
      take: 1000,
    });

    return tags.map(tag => ({
      mid: tag.mid,
      name: tag.name,
      slug: tag.slug,
      desc: tag.desc,
      type: tag.type,
      contentCount: tag._count.contentrelations,
    }));
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取标签列表失败",
    });
  }
});
