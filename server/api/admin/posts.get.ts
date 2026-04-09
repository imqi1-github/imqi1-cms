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
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 5;
    const categoryId = query.category ? Number(query.category) : undefined;
    const tagId = query.tag ? Number(query.tag) : undefined;
    const status = query.status ? Number(query.status) : undefined;

    const where: any = {
      type: 0, // 0: 文章
    };

    if (categoryId) {
      where.postrelation = {
        some: {
          mid: categoryId,
        },
      };
    }

    if (tagId) {
      where.AND = where.AND || [];
      where.AND.push({
        postrelation: {
          some: {
            mid: tagId,
          },
        },
      });
    }

    if (status !== undefined) {
      where.status = status;
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { cid: "desc" },
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
          postrelation: {
            include: {
              category: {
                select: {
                  mid: true,
                  name: true,
                  type: true,
                },
              },
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
