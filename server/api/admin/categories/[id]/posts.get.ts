import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少分类 ID",
    });
  }

  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 12;
  const status = query.status ? Number(query.status) : undefined;

  try {
    const categoryId = Number(id);

    // 构建查询条件
    const where: any = {
      relations: {
        some: {
          mid: categoryId,
        },
      },
    };

    if (status !== undefined) {
      where.status = status;
    }

    // 获取总数
    const total = await prisma.post.count({ where });

    // 获取文章列表
    const posts = await prisma.post.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { create_time: "desc" },
      select: {
        cid: true,
        title: true,
        slug: true,
        desc: true,
        status: true,
        create_time: true,
        update_time: true,
        comment_num: true,
        many_covers: true,
        covers: true,
      },
    });

    return {
      success: true,
      data: {
        list: posts,
        total,
        page,
        pageSize,
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取分类文章失败",
    });
  }
});
