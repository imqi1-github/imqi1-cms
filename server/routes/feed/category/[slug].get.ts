import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { buildContentRssItem, getSiteBaseUrl, setRssResponse, wrapRssChannel } from "#server/utils/feed";

/**
 * /feed/category/:slug —— 该分类下的全部已发布文章 RSS。
 *
 * 校验 slug 必须属于 type="category" 的 meta，否则 404；
 * 文章通过 contentrelations 反查；分类不存在时不返回空 feed（避免被错误订阅）。
 */
export default defineEventHandler(async event => {
  const slug = getRouterParam(event, "slug");

  if (!slug) {
    throw createError({ statusCode: 400, message: "分类 slug 不能为空" });
  }

  try {
    // 校验分类存在；metas.slug 全局唯一，type="category" 限定才能命中分类而非标签
    const category = await prisma.metas.findFirst({
      where: { slug, type: "category" },
      select: { mid: true, name: true, slug: true, desc: true },
    });

    if (!category) {
      throw createError({ statusCode: 404, message: "分类不存在" });
    }

    const [contents, baseUrl] = await Promise.all([
      prisma.contents.findMany({
        where: {
          status: 1,
          type: 0,
          contentrelations: {
            some: { mid: category.mid },
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
          categorySlug: category.slug,
        },
        baseUrl,
      ),
    );

    const lastBuildDate = contents[0]?.create_time ?? new Date();
    const description = category.desc || `${category.name} 分类下的全部文章`;

    const xml = wrapRssChannel({
      title: `${category.name} - 文章订阅`,
      description,
      baseUrl,
      selfPath: `/feed/category/${slug}`,
      items,
      lastBuildDate,
    });

    setRssResponse(event);
    return xml;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "分类不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "生成分类 RSS 失败" });
  }
});