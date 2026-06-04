import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取站点设置
    const siteSettings = await prisma.information.findUnique({
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
        postrelation: {
          select: {
            meta: {
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
        const categorySlug = post.postrelation?.[0]?.meta?.slug || "default";
        const postUrl = `${baseUrl}/content/${categorySlug}/${post.slug || post.cid}`;
        const author = post.user?.nickname || post.user?.name || "Admin";
        const pubDate = new Date(post.create_time).toUTCString();

        // 清理描述，移除 HTML 标签，并截断添加省略号
        let description = "";
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

        if (post.covers) {
          try {
            const covers = JSON.parse(post.covers);
            if (Array.isArray(covers) && covers.length > 0) {
              // 获取第一张封面
              const firstCover = typeof covers[0] === "string" ? covers[0] : covers[0]?.url;
              if (firstCover) {
                coverImage = firstCover;

                // Media RSS 内容标签
                mediaContent = `    <media:content url="${coverImage}" medium="image" type="image/jpeg">
      <media:title><![CDATA[${post.title}]]></media:title>
    </media:content>`;

                // 标准 enclosure 标签（用于兼容性）
                enclosure = `    <enclosure url="${coverImage}" type="image/jpeg" length="0" />`;
              }
            }
          } catch (e) {
            // 解析失败，忽略封面
          }
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

    const lastBuildDate = posts.length > 0 ? new Date(posts[0].create_time).toUTCString() : new Date().toUTCString();

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
    console.error("生成 RSS 失败:", error);
    throw createError({
      statusCode: 500,
      message: "生成 RSS 失败",
    });
  }
});
