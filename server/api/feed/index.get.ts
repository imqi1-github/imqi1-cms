import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取站点设置
    const siteSettings = await prisma.meta.findUnique({
      where: { key: "siteSettings" },
    });

    let siteName = "ImQi1";
    let siteUrl = "";
    let siteDesc = "";

    if (siteSettings?.value) {
      try {
        const settings = JSON.parse(siteSettings.value);
        siteName = settings.siteName || siteName;
        siteUrl = settings.siteUrl || "";
        siteDesc = settings.siteDesc || "";
      } catch {
        // 解析失败使用默认值
      }
    }

    // 获取最新文章（只获取已发布的，type=0 表示文章）
    const posts = await prisma.post.findMany({
      where: {
        status: 1,
        type: 0,
      },
      include: {
        user: {
          select: {
            nickname: true,
            name: true,
          },
        },
      },
      orderBy: {
        create_time: "desc",
      },
      take: 20, // 最多20篇
    });

    // 获取请求的协议和主机
    const host = event.node.req.headers.host || "";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = siteUrl || `${protocol}://${host}`;

    // 生成 RSS XML
    const rssItems = posts.map(post => {
      const postUrl = `${baseUrl}/content/${post.slug || post.cid}`;
      const author = post.user?.nickname || post.user?.name || "Admin";
      const pubDate = new Date(post.create_time).toUTCString();

      // 清理描述，移除 HTML 标签
      const description = post.desc
        ? post.desc.replace(/<[^>]*>/g, "").substring(0, 200)
        : post.content
          ? post.content.replace(/<[^>]*>/g, "").substring(0, 200)
          : "";

      return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <description><![CDATA[${description}]]></description>
      <author><![CDATA[${author}]]></author>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    }).join("\n");

    const lastBuildDate = posts.length > 0
      ? new Date(posts[0].create_time).toUTCString()
      : new Date().toUTCString();

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
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
    console.error("生成 RSS 失败:", error);
    throw createError({
      statusCode: 500,
      message: "生成 RSS 失败",
    });
  }
});
