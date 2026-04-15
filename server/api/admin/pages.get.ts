import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  try {
    const query = getQuery(event);
    const page = parseInt(query.page as string) || 1;
    const pageSize = parseInt(query.pageSize as string) || 10;
    const status = query.status !== undefined ? parseInt(query.status as string) : undefined;

    const where: any = {
      type: 1, // 1: 页面
    };

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
              nickname: true,
            },
          },
        },
      }),
      prisma.post.count({ where }),
    ]);

    // 获取每个页面的分类
    const pagesWithRelations = await Promise.all(
      posts.map(async (post: any) => {
        const relations = await prisma.postrelation.findMany({
          where: { cid: post.cid },
          select: {
            cid: true,
            mid: true,
            meta: {
              select: {
                mid: true,
                name: true,
                slug: true,
              },
            },
          },
        });

        return {
          ...post,
          relations,
        };
      })
    );

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: pagesWithRelations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取页面失败",
    });
  }
});
