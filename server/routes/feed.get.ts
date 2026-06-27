import { parseCovers } from "#server/utils/covers";
import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

export default defineEventHandler(async event => {
  try {
    // 获取站点设置（逐 key 读取，与其他 API 一致）
    const meta = await prisma.informations.findMany();
    const infoMap: Record<string, string> = {};
    meta.forEach((item: any) => {
      infoMap[item.key] = item.value;
    });

    const siteName = infoMap["siteName"] || siteConfig.siteName;
    const siteUrl = infoMap["siteUrl"] || siteConfig.siteUrl;
    const siteDesc = infoMap["siteDesc"] || siteConfig.seo.description;

    // 获取最新文章（只获取已发布的，type=0 表示文章）
    const posts = await prisma.posts.findMany({
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
        postrelations: {
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
    const rssItems = posts
      .map(post => {
        // 获取第一个关联分类的 slug，如果没有则使用 'default'
        const categorySlug = post.postrelations?.[0]?.metas?.slug || "default";
        const postUrl = `${baseUrl}/content/${categorySlug}/${post.slug || post.cid}`;
        const author = post.user?.nickname || post.user?.name || "Admin";
        const pubDate = new Date(post.create_time).toUTCString();

        // 清理描述，移除 HTML 标签，并截断添加省略号
        let description: string;
        const rawDesc = post.desc || post.content || "";
        const cleanDesc = rawDesc.replace(/<[^>]*>/g, "");

        if (cleanDesc.length > 200) {
          description = cleanDesc.substring(0, 200) + "...";
        } else {
          description = cleanDesc;
        }

        // 解析封面图片
        let coverImage = "";
        let mediaContent = "";
        let enclosure = "";

        const covers = parseCovers(post.covers);
        const firstCover = covers[0];
        if (firstCover) {
          coverImage = firstCover.url;

          // Media RSS 内容标签
          mediaContent = `    <media:content url="${coverImage}" medium="image" type="image/jpeg">
      <media:title><![CDATA[${post.title}]]></media:title>
    </media:content>`;

          // 标准 enclosure 标签（用于兼容性）
          enclosure = `    <enclosure url="${coverImage}" type="image/jpeg" length="0" />`;
        }

        return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <description><![CDATA[${description}]]></description>
      <author><![CDATA[${author}]]></author>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
${enclosure}
${mediaContent}
    </item>`;
      })
      .join("\n");

    const lastBuildDate = posts.length > 0 ? new Date(posts[0]?.create_time ?? Date.now()).toUTCString() : new Date().toUTCString();

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
