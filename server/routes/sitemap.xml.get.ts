import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取CDN配置
    // const config = useRuntimeConfig();
    // const cdnURL = config.public.cdnURL as string;

    // 获取请求的协议和主机
    const host = event.node.req.headers.host || "";
    // 移除端口号，特别是443（HTTPS默认端口）和80（HTTP默认端口）
    const hostWithoutPort = host.replace(/:(443|80)$/, "");
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${hostWithoutPort}`;

    // 获取所有已发布的文章
    const posts = await prisma.post.findMany({
      where: {
        status: 1, // 1: 已发布
        type: 0, // 0: 文章
      },
      select: {
        cid: true,
        slug: true,
        type: true,
        update_time: true,
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
    });

    console.log("[sitemap] 查询到的文章数量:", posts.length);
    console.log(
      "[sitemap] 文章列表:",
      posts.map(p => ({ cid: p.cid, slug: p.slug, type: p.type })),
    );

    // 获取所有独立页面
    const pages = await prisma.post.findMany({
      where: {
        type: 1, // 1: 页面
        status: 1, // 1: 已发布
      },
      select: {
        slug: true,
        update_time: true,
      },
    });

    console.log("[sitemap] 查询到的页面数量:", pages.length);

    // 获取所有分类
    const categories = await prisma.meta.findMany({
      where: {
        type: "category", // 或者不设置，获取默认类型
      },
      select: {
        slug: true,
      },
    });

    console.log("[sitemap] 查询到的分类数量:", categories.length);

    // 获取所有标签（tags 也存储在 category 表中，type="tag"）
    const tags = await prisma.meta.findMany({
      where: {
        type: "tag",
      },
      select: {
        slug: true,
      },
    });

    console.log("[sitemap] 查询到的标签数量:", tags.length);

    // 构建 URL 列表
    const urls: string[] = [];

    // 首页
    urls.push(
      `  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
    );

    // 搜索页
    urls.push(
      `  <url>
    <loc>${baseUrl}/search</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    );

    // 留言页
    urls.push(
      `  <url>
    <loc>${baseUrl}/message</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    );

    // 友链页
    urls.push(
      `  <url>
    <loc>${baseUrl}/links</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
    );

    // 关于页
    urls.push(
      `  <url>
    <loc>${baseUrl}/about</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`,
    );

    // 协议页
    urls.push(
      `  <url>
    <loc>${baseUrl}/agreement</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    );

    // 更新日志
    urls.push(
      `  <url>
    <loc>${baseUrl}/changelogs</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    );

    // RSS
    urls.push(
      `  <url>
    <loc>${baseUrl}/feed</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    );

    // 归档页
    urls.push(
      `  <url>
    <loc>${baseUrl}/archiving</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    );

    // 所有文章
    posts.forEach(post => {
      const lastmod = post.update_time ? new Date(post.update_time).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      // 获取第一个关联分类的slug，如果没有则使用 'default'
      const categorySlug = post.postrelation?.[0]?.meta?.slug || "default";
      urls.push(
        `  <url>
    <loc>${baseUrl}/content/${categorySlug}/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      );
    });

    // 所有独立页面（type=1，排除 message 和 agreement）
    pages
      .filter(page => page.slug !== "message" && page.slug !== "agreement")
      .forEach(page => {
        const lastmod = page.update_time ? new Date(page.update_time).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        urls.push(
          `  <url>
    <loc>${baseUrl}/${page.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
        );
      });

    // 所有分类页
    categories.forEach(category => {
      urls.push(
        `  <url>
    <loc>${baseUrl}/category/${category.slug}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
      );
    });

    // 所有标签页
    tags.forEach(tag => {
      urls.push(
        `  <url>
    <loc>${baseUrl}/tag/${tag.slug}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`,
      );
    });

    console.log("[sitemap] 生成的 URL 总数:", urls.length);

    // 构建 XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    // 设置响应头
    setHeader(event, "Content-Type", "application/xml; charset=utf-8");
    setHeader(event, "Cache-Control", "public, max-age=3600"); // 缓存1小时

    return xml;
  } catch (error) {
    console.error("[sitemap] 生成 sitemap 失败:", error);

    // 即使出错也返回基本的 sitemap
    const host = event.node.req.headers.host || "";
    // 移除端口号，特别是443（HTTPS默认端口）和80（HTTP默认端口）
    const hostWithoutPort = host.replace(/:(443|80)$/, "");
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${hostWithoutPort}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

    setHeader(event, "Content-Type", "application/xml; charset=utf-8");
    return xml;
  }
});
