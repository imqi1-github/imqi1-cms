import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { buildContentRssItem, getSiteBaseUrl, setRssResponse, wrapRssChannel } from "#server/utils/feed";

/**
 * /feed/tag/:slug —— 该标签下的全部已发布文章 RSS。
 *
 * 校验 slug 必须属于 type="tag" 的 meta，否则 404；
 * 文章通过 contentrelations 反查；标签存在但无文章时仍返回空 channel 200。
 */
export default defineEventHandler(async event => {
  const slug = getRouterParam(event, "slug");

  if (!slug) {
    throw createError({ statusCode: 400, message: "标签 slug 不能为空" });
  }

  try {
    const tag = await prisma.metas.findFirst({
      where: { slug, type: "tag" },
      select: { mid: true, name: true, slug: true, desc: true },
    });

    if (!tag) {
      throw createError({ statusCode: 404, message: "标签不存在" });
    }

    const [contents, baseUrl] = await Promise.all([
      prisma.contents.findMany({
        where: {
          status: 1,
          type: 0,
          contentrelations: {
            some: { mid: tag.mid },
          },
        },
        select: {
          cid: true,
          slug: true,
          title: true,
          desc: true,
          content: true,
          create_time: true,
          covers: true,
          user: { select: { nickname: true, name: true } },
          // 文章自身仍需分类 slug 来拼真实链接：contentrelations[0] 是分类（helper 已加 orderBy+type filter）
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            select: { metas: { select: { slug: true } } },
            take: 1,
          },
        },
        orderBy: { create_time: "desc" },
      }),
      getSiteBaseUrl(),
    ]);

    const items = contents.map(content =>
      buildContentRssItem(
        {
          cid: content.cid,
          slug: content.slug,
          title: content.title,
          desc: content.desc,
          content: content.content,
          create_time: content.create_time,
          covers: content.covers,
          authorNickname: content.user?.nickname ?? null,
          authorName: content.user?.name ?? null,
          categorySlug: content.contentrelations?.[0]?.metas?.slug ?? null,
        },
        baseUrl,
      ),
    );

    const lastBuildDate = contents[0]?.create_time ?? new Date();
    const description = tag.desc || `${tag.name} 标签下的全部文章`;

    const xml = wrapRssChannel({
      title: `#${tag.name} - 文章订阅`,
      description,
      baseUrl,
      selfPath: `/feed/tag/${slug}`,
      items,
      lastBuildDate,
    });

    setRssResponse(event);
    return xml;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "标签不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "生成标签 RSS 失败" });
  }
});