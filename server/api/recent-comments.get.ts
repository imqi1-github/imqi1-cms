import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = parseInt(query.limit as string) || 20;

    // 解析留言板关联文章 cid：留言板是独立 /messages 路由（page 型，无分类关系），
    // 其评论在下面的过滤里要单独放行、并改走 /messages 链接（解析逻辑同 /api/messages/config）。
    const messageContentIdMeta = await prisma.informations.findUnique({
      where: { key: "messageContentId" },
    });
    let guestbookCid = messageContentIdMeta?.value ? parseInt(messageContentIdMeta.value) : null;
    if (!guestbookCid) {
      const messageContent = await prisma.contents.findFirst({
        where: { slug: "messages" },
        select: { cid: true },
      });
      guestbookCid = messageContent?.cid ?? null;
    }

    // 头像源与评论区共用同一份设置与服务端拼装逻辑（见 server/utils/comment-avatar）
    const avatarService = await getCommentAvatarService();

    // 获取最近的评论（获取比需要更多的评论，因为后续会过滤）
    const comments = await prisma.comments.findMany({
      where: {
        status: 1, // 已审核
      },
      select: {
        coid: true,
        content: true,
        name: true,
        mail: true,
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
        if (!comment.content_ref) return false;
        // 留言板评论：cid 命中留言板文章即放行——/messages 是系统路由始终可访问，
        // 不要求分类关系（page 型无分类）也不卡文章 status。
        if (guestbookCid && comment.content_ref.cid === guestbookCid) return true;
        // 文章评论：需分类关系才能拼 /content/<分类slug>/<文章slug>，且只指向已发布文章避免 404
        return (
          comment.content_ref.status === 1 &&
          comment.content_ref.slug &&
          comment.content_ref.contentrelations &&
          comment.content_ref.contentrelations.length > 0 &&
          comment.content_ref.contentrelations[0]?.metas
        );
      })
      .map(comment => {
        // 留言板：链接走 /messages，模板侧会自动追加 #comment-<coid> 锚点滚动定位
        if (guestbookCid && comment.content_ref.cid === guestbookCid) {
          return {
            coid: comment.coid,
            text: comment.content,
            author: comment.name,
            avatar: commentAvatarUrl(comment.mail, avatarService),
            created: comment.create_time,
            contents: {
              title: comment.content_ref.title || "留言",
              url: "/messages",
            },
          };
        }

        const categorySlug = comment.content_ref.contentrelations[0]?.metas?.slug ?? "";
        const contentSlug = comment.content_ref.slug;
        const contentUrl = `/content/${categorySlug}/${contentSlug}`;

        return {
          coid: comment.coid,
          text: comment.content,
          author: comment.name,
          avatar: commentAvatarUrl(comment.mail, avatarService),
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
