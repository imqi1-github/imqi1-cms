import { prisma } from "#server/utils/prisma";
import { escapeXml } from "#server/utils/xml";
import { siteConfig } from "~~/site.config";

// 站点根 URL 一律取自配置的 siteUrl（绝不取客户端 Host 头，防 host 投毒）。
const baseUrl = siteConfig.siteUrl.replace(/\/$/, "");

export default defineEventHandler(async event => {
  try {
    // 文章/页面/分类/标签四个查询互不依赖，并行取回避免串行叠加延迟。
    // 文章 contentrelations 需 type:"category" 过滤 + orderBy，否则 contentrelations[0] 可能取到标签而非分类。
    const [contents, pages, categories, tags] = await Promise.all([
      // 所有已发布的文章
      prisma.contents.findMany({
        where: {
          status: 1, // 1: 已发布
          type: 0, // 0: 文章
        },
        select: {
          slug: true,
          update_time: true,
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
            take: 1, // 只取第一个分类
          },
        },
      }),
      // 所有独立页面
      prisma.contents.findMany({
        where: {
          type: 1, // 1: 页面
          status: 1, // 1: 已发布
        },
        select: {
          slug: true,
          update_time: true,
        },
      }),
      // 所有分类
      prisma.metas.findMany({
        where: {
          type: "category", // 或者不设置，获取默认类型
        },
        select: {
          slug: true,
        },
      }),
      // 所有标签（tags 也存储在 category 表中，type="tag"）
      prisma.metas.findMany({
        where: {
          type: "tag",
        },
        select: {
          slug: true,
        },
      }),
    ]);

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
    <loc>${baseUrl}/messages</loc>
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

    // 地图中心页（我的足迹 / 访客分布）
    urls.push(
      `  <url>
    <loc>${baseUrl}/map</loc>
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

    // 订阅页（我的订阅 / RSS 订阅源列表）
    urls.push(
      `  <url>
    <loc>${baseUrl}/subscribes</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
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

    // 所有文章（跳过空/空字符串 slug，避免发 "null" 进 loc）
    contents.forEach(content => {
      if (!content.slug) return;
      const lastmod = content.update_time ? new Date(content.update_time).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      // 获取第一个关联分类的slug，如果没有则使用 'uncategorized'（与前台 archiving/tag/search 一致）
      const categorySlug = content.contentrelations?.[0]?.metas?.slug || "uncategorized";
      const loc = escapeXml(`${baseUrl}/content/${categorySlug}/${content.slug}`);
      urls.push(
        `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      );
    });

    // 所有独立页面（type=1，排除 message 和 agreement；跳过空/空字符串 slug）
    pages
      // 排除已在上面硬编码的独立页面 slug（messages 复数，避免与硬编码的 /messages 重复）
      .filter(page => {
        // 排除全部已在上面硬编码的独立路由 slug，避免 DB 页面与静态条目生成重复 <loc>
        const HARDCODED = ["messages", "agreement", "about", "map", "search", "links", "changelogs", "subscribes", "feed", "archiving"];
        return page.slug && !HARDCODED.includes(page.slug);
      })
      .forEach(page => {
        const lastmod = page.update_time ? new Date(page.update_time).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const loc = escapeXml(`${baseUrl}/${page.slug}`);
        urls.push(
          `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
        );
      });

    // 所有分类页（跳过空/空字符串 slug）
    categories.forEach(category => {
      if (!category.slug) return;
      const loc = escapeXml(`${baseUrl}/category/${category.slug}`);
      urls.push(
        `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
      );
    });

    // 所有标签页（跳过空/空字符串 slug）
    tags.forEach(tag => {
      if (!tag.slug) return;
      const loc = escapeXml(`${baseUrl}/tag/${tag.slug}`);
      urls.push(
        `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`,
      );
    });

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
    console.error("[sitemap] 生成失败:", error);

    // DB 出错时返回 5xx，而非 fail-open 的一页 sitemap（避免误导搜索索引）。
    // 已带 statusCode 的错误（含本 handler 的 createError）原样抛出；未知错误不向前端透传 message。
    if (typeof (error as { statusCode?: number })?.statusCode === "number") {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "Sitemap generation failed",
    });
  }
});
