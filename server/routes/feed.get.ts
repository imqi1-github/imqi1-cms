import { markdownToPlainText, spaceCjkLatin } from "#server/utils/markdownToPlainText";
import { parseCovers } from "#server/utils/covers";
import { prisma } from "#server/utils/prisma";
import { escapeXml } from "#server/utils/xml";
import { siteConfig } from "~~/site.config";

// CDATA 内容若含 ]]> 会提前闭合，用标准拆分技巧规避（markdown 正文极少出现，兜底防御）。
function cdata(text: string): string {
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

export default defineEventHandler(async event => {
  try {
    // 站点设置与最新文章并行查询（二者无依赖，串行会叠加延迟）。
    // 设置只取本 handler 用到的 key；文章的 contentrelations 需 type:"category" 过滤 + orderBy，
    // 否则 contentrelations[0] 可能取到标签而非分类，导致 feed 链接指向 tag 路由。
    const [meta, contents] = await Promise.all([
      prisma.informations.findMany({
        where: {
          key: { in: ["siteName", "siteUrl", "siteDesc"] },
        },
        select: {
          key: true,
          value: true,
        },
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
    ]);

    const infoMap: Record<string, string> = {};
    meta.forEach((item) => {
      infoMap[item.key] = item.value;
    });

    const siteName = infoMap["siteName"] || siteConfig.siteName;
    const siteUrl = infoMap["siteUrl"] || siteConfig.siteUrl;
    const siteDesc = infoMap["siteDesc"] || siteConfig.seo.description;

    // 站点根地址：只用配置（DB siteUrl → siteConfig.siteUrl），不信任客户端 Host 头，
    // 防 Host 注入生成任意绝对 URL 污染 feed 内 link/guid。
    let baseUrl = siteUrl;
    if (!baseUrl) {
      const config = useRuntimeConfig();
      const rootDomain = (config.public.rootDomain as string) || siteConfig.rootDomain || "";
      if (rootDomain) {
        const protocol = rootDomain.includes("localhost") ? "http" : "https";
        baseUrl = `${protocol}://${rootDomain}`;
      }
    }

    // 生成 RSS XML
    const rssItems = contents
      .map(content => {
        // 获取第一个关联分类的 slug，如果没有则使用 'default'
        const categorySlug = content.contentrelations?.[0]?.metas?.slug || "default";
        const contentUrl = `${baseUrl}/content/${categorySlug}/${content.slug || content.cid}`;
        const author = content.user?.nickname || content.user?.name || "Admin";
        const pubDate = new Date(content.create_time).toUTCString();

        // 正文转纯文本：markdown→纯文本，::: 容器/代码块/图片/表格按规则替换为中文占位
        // （<图片：标题>、<代码块：语言xx，共xx行>、<表格：共x行y列>、<音乐：平台，id=xxx> 等，
        //  实况照片为 <实况照片：标题>，见 utils/markdownToPlainText）。
        // 需求"只要全文、不重复"：不再做摘要截断，全文放 description。
        const fullText = markdownToPlainText(content.content || content.desc || "");

        // 封面占位：<图片：标题>/<实况照片：标题>（封面标题为空则仅占位，不带标题）；
        // 视频封面不展示图片占位。实况封面按 url 里的 #live 标记判定。
        const covers = parseCovers(content.covers);
        const cover = covers[0];
        const isVideoCover = /\.(mp4|webm)([?#]|$)/i.test(cover?.url ?? "");
        const isLiveCover = /#live\b/i.test(cover?.url ?? "");
        const coverTitle = cover?.desc?.trim() ?? "";
        const coverKind = isLiveCover ? "实况照片" : "图片";
        const coverPlaceholder = cover && !isVideoCover
          ? (coverTitle ? `<${coverKind}：${coverTitle}>` : `<${coverKind}>`)
          : "";
        // 封面占位单独补一次中英空格（正文已在 markdownToPlainText 内补过，无需再处理）
        const descriptionText = coverPlaceholder ? `${spaceCjkLatin(coverPlaceholder)}\n${fullText}` : fullText;

        return `
    <item>
      <title><![CDATA[${cdata(content.title)}]]></title>
      <link>${escapeXml(contentUrl)}</link>
      <description><![CDATA[${cdata(descriptionText)}]]></description>
      <author><![CDATA[${cdata(author)}]]></author>
      <guid isPermaLink="true">${escapeXml(contentUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
      })
      .join("\n");

    const lastBuildDate = contents.length > 0 ? new Date(contents[0]?.create_time ?? Date.now()).toUTCString() : new Date().toUTCString();

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title><![CDATA[${cdata(siteName)}]]></title>
    <link>${escapeXml(baseUrl)}</link>
    <description><![CDATA[${cdata(siteDesc || siteName + " - 最新文章")}]]></description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl + "/feed")}" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

    // 设置响应头
    setHeader(event, "Content-Type", "application/rss+xml; charset=utf-8");
    setHeader(event, "Cache-Control", "public, max-age=3600"); // 缓存1小时

    return rssXml;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "生成 RSS 失败",
    });
  }
});
