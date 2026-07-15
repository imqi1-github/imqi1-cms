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
            status: true, // 仅保留已发布文章（status:1），避免评论链接到下架/草稿文章而 404
            // 只取分类关系：一篇文章同时有分类和标签关系，不加 type 过滤时 take:1 可能抓到标签，
            // 导致拼出 /content/<标签slug>/<文章slug> 而 404
            contentrelations: {
              where: {
                metas: { type: "category" },
              },
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
               // 仅保留指向已发布文章的评论，避免链接到已下架/草稿文章而 404
               comment.content_ref.status === 1 &&
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
