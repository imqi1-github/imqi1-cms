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
        posts: {
          select: {
            cid: true,
            title: true,
            slug: true,
            postrelations: {
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
        return comment.posts &&
               comment.posts.cid &&
               comment.posts.slug &&
               comment.posts.postrelations &&
               comment.posts.postrelations.length > 0 &&
               comment.posts.postrelations[0]?.metas;
      })
      .map(comment => {
        const categorySlug = comment.posts.postrelations[0]?.metas?.slug ?? "";
        const postSlug = comment.posts.slug;
        const postUrl = `/content/${categorySlug}/${postSlug}`;

        return {
          coid: comment.coid,
          text: comment.content,
          author: comment.name,
          created: comment.create_time,
          posts: {
            title: comment.posts.title,
            url: postUrl,
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
