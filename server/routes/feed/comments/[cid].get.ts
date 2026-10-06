import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { buildCommentRssItem, getSiteBaseUrl, setRssResponse, wrapRssChannel } from "#server/utils/feed";

/**
 * /feed/comments/:cid —— 指定文章的全部已审核评论 RSS。
 *
 * 校验文章存在且 status=1 + type=0，否则 404；
 * 评论仅 status=1（已通过审核）才下发，避免 feed 把脏数据泄给阅读器。
 * 文章下无评论时仍返回空 channel 200。
 */
export default defineEventHandler(async event => {
  const cidParam = getRouterParam(event, "cid");
  const cid = Number(cidParam);

  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "文章 ID 非法" });
  }

  try {
    const content = await prisma.contents.findFirst({
      where: { cid, status: 1, type: 0 },
      select: {
        cid: true,
        slug: true,
        title: true,
        contentrelations: {
          where: { metas: { type: "category" } },
          orderBy: { mid: "asc" },
          select: { metas: { select: { slug: true } } },
          take: 1,
        },
      },
    });

    if (!content) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }

    const categorySlug = content.contentrelations?.[0]?.metas?.slug ?? "uncategorized";

    const [comments, baseUrl] = await Promise.all([
      prisma.comments.findMany({
        where: { cid, status: 1 },
        orderBy: { create_time: "desc" },
        select: {
          coid: true,
          cid: true,
          name: true,
          content: true,
          create_time: true,
        },
      }),
      getSiteBaseUrl(),
    ]);

    const items = comments.map(comment =>
      buildCommentRssItem(
        {
          coid: comment.coid,
          cid: comment.cid,
          name: comment.name,
          content: comment.content,
          create_time: comment.create_time,
          contentSlug: content.slug,
          contentTitle: content.title,
          categorySlug,
        },
        baseUrl,
      ),
    );

    const lastBuildDate = comments[0]?.create_time ?? new Date();
    const description = `《${content.title}》的全部读者留言`;

    const xml = wrapRssChannel({
      title: `${content.title} - 留言订阅`,
      description,
      baseUrl,
      selfPath: `/feed/comments/${cid}`,
      items,
      lastBuildDate,
    });

    setRssResponse(event);
    return xml;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "生成评论 RSS 失败" });
  }
});