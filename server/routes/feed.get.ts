import { markdownToPlainText } from "#server/utils/markdownToPlainText";
import { parseCovers } from "#server/utils/covers";
import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

// CDATA 内容若含 ]]> 会提前闭合，用标准拆分技巧规避（markdown 正文极少出现，兜底防御）。
function cdata(text: string): string {
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

export default defineEventHandler(async event => {
  try {
    // 获取站点设置（逐 key 读取，与其他 API 一致）
    const meta = await prisma.informations.findMany();
    const infoMap: Record<string, string> = {};
    meta.forEach((item) => {
      infoMap[item.key] = item.value;
    });

    const siteName = infoMap["siteName"] || siteConfig.siteName;
    const siteUrl = infoMap["siteUrl"] || siteConfig.siteUrl;
    const siteDesc = infoMap["siteDesc"] || siteConfig.seo.description;

    // 获取最新文章（只获取已发布的，type=0 表示文章）
    const contents = await prisma.contents.findMany({
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
          select: {
            metas: {
              select: {
                slug: true,
              },
            },
          },
          take: 1, // 只取第一个分类
        },
      },
      orderBy: {
        create_time: "desc",
      },
      take: 20, // 最多20篇
    });

    // 获取请求的协议和主机
    let host = event.node.req.headers.host || "";
    // 移除标准端口号（443 和 80）
    host = host.replace(/:(443|80)$/, "");

    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = siteUrl || `${protocol}://${host}`;

    // 生成 RSS XML
    const rssItems = contents
      .map(content => {
        // 获取第一个关联分类的 slug，如果没有则使用 'default'
        const categorySlug = content.contentrelations?.[0]?.metas?.slug || "default";
        const contentUrl = `${baseUrl}/content/${categorySlug}/${content.slug || content.cid}`;
        const author = content.user?.nickname || content.user?.name || "Admin";
        const pubDate = new Date(content.create_time).toUTCString();

        // 正文转纯文本：markdown→纯文本，::: 容器整块替换为 <中文类型> 占位
        // （见 utils/markdownToPlainText）。需求“只要全文、不重复”：不再做摘要截断，
        // 只用 description 输出完整正文纯文本——兼容性最好（所有阅读器/聚合器都读它）。
        const fullText = markdownToPlainText(content.content || content.desc || "");

        // 解析封面图片
        let coverImage: string;
        let mediaContent = "";
        let enclosure = "";

        const covers = parseCovers(content.covers);
        const firstCover = covers[0];
        if (firstCover) {
          coverImage = firstCover.url;

          // Media RSS 内容标签
          mediaContent = `    <media:content url="${coverImage}" medium="image" type="image/jpeg">
      <media:title><![CDATA[${content.title}]]></media:title>
    </media:content>`;

          // 标准 enclosure 标签（用于兼容性）
          enclosure = `    <enclosure url="${coverImage}" type="image/jpeg" length="0" />`;
        }

        return `
    <item>
      <title><![CDATA[${content.title}]]></title>
      <link>${contentUrl}</link>
      <description><![CDATA[${cdata(fullText)}]]></description>
      <author><![CDATA[${author}]]></author>
      <guid isPermaLink="true">${contentUrl}</guid>
      <pubDate>${pubDate}</pubDate>
${enclosure}
${mediaContent}
    </item>`;
      })
      .join("\n");

    const lastBuildDate = contents.length > 0 ? new Date(contents[0]?.create_time ?? Date.now()).toUTCString() : new Date().toUTCString();

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title><![CDATA[${siteName}]]></title>
    <link>${baseUrl}</link>
    <description><![CDATA[${siteDesc || siteName + " - 最新文章"}]]></description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${baseUrl}/feed" rel="self" type="application/rss+xml" />
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
