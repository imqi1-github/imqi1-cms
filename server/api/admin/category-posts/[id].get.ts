import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  const query = getQuery(event);

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少分类 ID",
    });
  }

  try {
    // 分页参数
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 12;
    const skip = (page - 1) * pageSize;

    // 获取分类下的文章
    const [relations, total] = await Promise.all([
      prisma.postRelation.findMany({
        where: { mid: Number(id) },
        include: {
          post: {
            select: {
              cid: true,
              title: true,
              slug: true,
              cover: true,
              summary: true,
              created: true,
              updated: true,
              status: true,
            },
          },
        },
        orderBy: {
          post: {
            created: "desc",
          },
        },
        skip,
        take: pageSize,
      }),
      prisma.postRelation.count({
        where: { mid: Number(id) },
      }),
    ]);

    return {
      success: true,
      data: relations.map(r => r.post),
      total,
      page,
      pageSize,
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取分类文章失败",
    });
  }
});
