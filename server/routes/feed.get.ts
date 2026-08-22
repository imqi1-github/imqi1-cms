import { markdownToPlainText, spaceCjkLatin } from "#server/utils/markdownToPlainText";
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

        // 正文转纯文本：markdown→纯文本，::: 容器/代码块/图片/表格按规则替换为中文占位
        // （<图片：标题>、<代码块：语言xx，共xx行>、<表格：共x行y列>、<音乐：平台，id=xxx> 等，
        //  实况照片为 <实况照片：标题>，见 utils/markdownToPlainText）。
        // 需求“只要全文、不重复”：不再做摘要截断，全文放 description。
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
      <title><![CDATA[${content.title}]]></title>
      <link>${contentUrl}</link>
      <description><![CDATA[${cdata(descriptionText)}]]></description>
      <author><![CDATA[${author}]]></author>
      <guid isPermaLink="true">${contentUrl}</guid>
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
