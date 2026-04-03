import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 5;
    const categoryId = query.category ? Number(query.category) : undefined;
    const status = query.status ? Number(query.status) : undefined;

    const where: any = {};

    if (categoryId) {
      where.relations = {
        some: {
          mid: categoryId,
        },
      };
    }

    if (status !== undefined) {
      where.status = status;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { create_time: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              uid: true,
              name: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error("获取文章失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取文章列表失败",
    });
  }
});
