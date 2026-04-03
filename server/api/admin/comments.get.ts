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

  try {
    const query = getQuery(event);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        orderBy: { create_time: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          post: {
            select: {
              cid: true,
              title: true,
            },
          },
        },
      }),
      prisma.comment.count(),
    ]);

    return {
      data: comments,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error) {
    console.error("获取评论失败:", error);
    throw createError({
      statusCode: 500,
      message: "获取评论列表失败",
    });
  }
});
