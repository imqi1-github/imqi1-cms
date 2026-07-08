import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = parseInt(query.limit as string) || 20;

    // 获取最近的评论（获取比需要更多的评论，因为后续会过滤）
    const comments = await prisma.comments.findMany({
      where: {
        status: 1, // 已审核
      },
      select: {
        coid: true,
        content: true,
        name: true,
        create_time: true,
        content_ref: {
          select: {
            cid: true,
            title: true,
            slug: true,
            contentrelations: {
              select: {
                metas: {
                  select: {
                    slug: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        create_time: "desc",
      },
      take: limit * 2, // 获取更多数据，因为后续会过滤
    });

    // 格式化评论数据，过滤掉没有有效文章链接的评论
    const formattedComments = comments
      .filter(comment => {
        // 确保评论有关联的文章且文章信息完整
        return comment.content_ref &&
               comment.content_ref.cid &&
               comment.content_ref.slug &&
               comment.content_ref.contentrelations &&
               comment.content_ref.contentrelations.length > 0 &&
               comment.content_ref.contentrelations[0]?.metas;
      })
      .map(comment => {
        const categorySlug = comment.content_ref.contentrelations[0]?.metas?.slug ?? "";
        const contentSlug = comment.content_ref.slug;
        const contentUrl = `/content/${categorySlug}/${contentSlug}`;

        return {
          coid: comment.coid,
          text: comment.content,
          author: comment.name,
          created: comment.create_time,
          contents: {
            title: comment.content_ref.title,
            url: contentUrl,
          },
        };
      })
      .slice(0, limit); // 只返回需要的数量

    return {
      code: 200,
      message: "获取最近评论成功",
      data: formattedComments,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取最近评论失败",
    });
  }
});
