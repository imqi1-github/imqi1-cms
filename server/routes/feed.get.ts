import { prisma } from "#server/utils/prisma";
import { buildContentRssItem, getSiteBaseUrl, setRssResponse, wrapRssChannel } from "#server/utils/feed";
import { siteConfig } from "~~/site.config";

export default defineEventHandler(async event => {
  try {
    // 设置与最新文章并行查询（二者无依赖，串行会叠加延迟）。
    // 设置只取 handler 用到的 key；文章的 contentrelations 需 type:"category" 过滤 + orderBy，
    // 否则 contentrelations[0] 可能取到标签而非分类，导致 feed 链接指向 tag 路由。
    const [siteMeta, contents, baseUrl] = await Promise.all([
      prisma.informations.findMany({
        where: { key: { in: ["siteName", "siteDesc"] } },
        select: { key: true, value: true },
      }),
      prisma.contents.findMany({
        where: {
          status: 1,
          type: 0,
        },
        select: {
          cid: true,
          slug: true,
          title: true,
          desc: true,
          content: true,
          create_time: true,
          covers: true,
          user: {
            select: {
              nickname: true,
              name: true,
            },
          },
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
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
        orderBy: {
          create_time: "desc",
        },
        take: 20, // 最多20篇
      }),
      getSiteBaseUrl(),
    ]);

    const infoMap: Record<string, string> = {};
    siteMeta.forEach(item => {
      infoMap[item.key] = item.value;
    });

    const siteName = infoMap["siteName"] || siteConfig.site.name;
    const siteDesc = infoMap["siteDesc"] || siteConfig.seo.description;

    const items = contents.map(content => {
      const categorySlug = content.contentrelations?.[0]?.metas?.slug ?? null;
      return buildContentRssItem(
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
          categorySlug,
        },
        baseUrl,
      );
    });

    const lastBuildDate = contents[0]?.create_time ?? new Date();

    const xml = wrapRssChannel({
      title: siteName,
      description: siteDesc || `${siteName} - 最新文章`,
      baseUrl,
      selfPath: "/feed",
      items,
      lastBuildDate,
    });

    setRssResponse(event);
    return xml;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "生成 RSS 失败",
    });
  }
});