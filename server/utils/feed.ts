/**
 * 生成我方站点的 RSS Feed 输出。
 *
 * 与 server/utils/rss.ts 区分：rss.ts 是解析外部订阅源（消费 RSS），
 * 本文件是把我方内容/分类/标签/评论序列化成 RSS 2.0 + Media RSS（生产 RSS）。
 *
 * 公开 helper：
 *   - getSiteBaseUrl()             ：取站点根地址（informations.siteUrl 优先，回落 site.config.ts）
 *   - buildContentRssItem(...)      ：生成单个文章 <item>
 *   - buildCommentRssItem(...)      ：生成单个评论 <item>
 *   - wrapRssChannel(...)           ：把若干 <item> 组装成完整 RSS XML
 *   - setRssResponse(event)         ：统一 setHeader（Content-Type + Cache-Control）
 */
import type { H3Event } from "h3";
import { setHeader } from "h3";

import { prisma } from "./prisma";
import { escapeXml } from "./xml";
import { markdownToPlainText } from "./markdownToPlainText";
import { parseCovers } from "./covers";

import { siteConfig } from "~~/site.config";
import { PUBLIC_CACHE_CONTROL_SHORT } from "#shared/constants";

// CDATA 内容若含 ]]> 会提前闭合，用标准拆分技巧规避（markdown 正文极少出现，兜底防御）
function cdata(text: string): string {
  return text.replace(/]]>/g, "]]]]><![CDATA[>");
}

// 封面 URL 扩展名 → MIME 类型（media:content type 属性），未知兜底 image/jpeg。
export function imageMimeType(url: string): string {
  const ext = (url.split(/[?#]/)[0]?.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

/**
 * 取站点根地址（用于拼绝对 URL）。
 *
 * 优先级：后台 settings.siteUrl → site.config.ts site.url → 据 rootDomain 推断 http(s) →
 * 空串。**绝不取客户端 Host 头**，防 host 投毒污染 feed 内 link/guid。
 *
 * 实现细节：传 `where.key.in: ["siteUrl"]`（与 main feed.get.ts 历史行为一致），命中站主
 * 常用 settings key 复合索引；不传单字符串 key 是为了让现有 fake-prisma mock（按 in schema 注册）
 * 无需额外改动即可识别。
 */
export async function getSiteBaseUrl(): Promise<string> {
  const rows = await prisma.informations.findMany({
    where: { key: { in: ["siteUrl"] } },
    select: { value: true },
  });
  const row = Array.isArray(rows) ? rows.find(item => item?.value != null) : null;
  let baseUrl = row?.value || siteConfig.site.url;
  if (!baseUrl) {
    const rootDomain = siteConfig.site.rootDomain || "";
    if (rootDomain) {
      const protocol = rootDomain.includes("localhost") ? "http" : "https";
      baseUrl = `${protocol}://${rootDomain}`;
    }
  }
  return (baseUrl || "").replace(/\/+$/, "");
}

/**
 * 生成单个文章 <item>。
 * contentRelations[0].metas.slug 必传（多个分类时取最前者，与 feed.get.ts 一致）。
 */
export interface ContentRssItemInput {
  cid: number;
  title: string;
  slug: string | null;
  desc: string | null;
  content: string | null;
  create_time: Date;
  covers: string | null;
  authorNickname: string | null;
  authorName: string | null;
  categorySlug: string | null;
}

export function buildContentRssItem(input: ContentRssItemInput, baseUrl: string): string {
  const {
    cid,
    title,
    slug,
    desc,
    content,
    create_time,
    covers: coversJson,
    authorNickname,
    authorName,
    categorySlug,
  } = input;

  // 无分类时 fallback 用 "default"（与 sitemap/main feed 的历史约定一致）
  const resolvedCategorySlug = categorySlug || "default";
  const contentUrl = `${baseUrl}/content/${resolvedCategorySlug}/${slug ?? cid}`;
  const author = authorNickname || authorName || "Admin";
  const pubDate = new Date(create_time).toUTCString();

  // 正文转纯文本：markdown → 纯文本，::: 容器/代码块/图片/表格按规则替换为中文占位
  const fullText = markdownToPlainText(content || desc || "");

  // 封面走 Media RSS（不拼中文占位到 description 开头），未知格式兜底 image/jpeg
  const covers = parseCovers(coversJson);
  const cover = covers[0];
  const isVideoCover = /\.(mp4|webm)([?#]|$)/i.test(cover?.url ?? "");
  const coverTitle = cover?.desc?.trim() ?? "";
  // coverUrl 去掉 #live 等 mock 片段，保证给阅读器的封面地址干净可抓取
  const coverUrl = (cover?.url ?? "").split("#")[0] ?? "";
  const mediaContent = cover && !isVideoCover
    ? `<media:content url="${escapeXml(coverUrl)}" type="${imageMimeType(coverUrl)}" medium="image" isDefault="true"${cover.width ? ` width="${cover.width}"` : ""}${cover.height ? ` height="${cover.height}"` : ""}${coverTitle ? ` title="${escapeXml(coverTitle)}"` : ""} />`
    : "";

  return `
    <item>
      <title><![CDATA[${cdata(title)}]]></title>
      <link>${escapeXml(contentUrl)}</link>
      <description><![CDATA[${cdata(fullText)}]]></description>
      ${mediaContent}
      <author><![CDATA[${cdata(author)}]]></author>
      <guid isPermaLink="true">${escapeXml(contentUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
}

/**
 * 生成单个评论 <item>，link 锚到文章评论位（#comment-coid）。
 */
export interface CommentRssItemInput {
  coid: number;
  cid: number;
  name: string;
  content: string;
  create_time: Date;
  contentSlug: string | null;
  contentTitle: string;
  categorySlug: string;
}

export function buildCommentRssItem(input: CommentRssItemInput, baseUrl: string): string {
  const { coid, cid, name, content, create_time, contentSlug, contentTitle, categorySlug } = input;
  const resolvedSlug = contentSlug ?? String(cid);
  const commentUrl = `${baseUrl}/content/${categorySlug}/${resolvedSlug}#comment-${coid}`;
  const pubDate = new Date(create_time).toUTCString();
  const title = `${name} 留言于《${contentTitle}》`;
  return `
    <item>
      <title><![CDATA[${cdata(title)}]]></title>
      <link>${escapeXml(commentUrl)}</link>
      <description><![CDATA[${cdata(content)}]]></description>
      <guid isPermaLink="true">${escapeXml(commentUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
}

export interface RssChannelOptions {
  title: string;
  description: string;
  baseUrl: string;
  /** 资源 self 路径，如 /feed、/feed/category/foo，与 baseUrl 拼成 atom:link href */
  selfPath: string;
  items: string[];
  lastBuildDate: Date;
}

/**
 * 把若干 <item> 组装成完整 RSS 2.0 + Media RSS / Atom self-link。
 * language 固定 zh-CN（站点中文单语）。
 */
export function wrapRssChannel(opts: RssChannelOptions): string {
  const { title, description, baseUrl, selfPath, items, lastBuildDate } = opts;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title><![CDATA[${cdata(title)}]]></title>
    <link>${escapeXml(baseUrl)}</link>
    <description><![CDATA[${cdata(description)}]]></description>
    <language>zh-CN</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl + selfPath)}" rel="self" type="application/rss+xml" />
    ${items.join("\n")}
  </channel>
</rss>`;
}

/**
 * 统一设置 RSS 响应的 Content-Type 与 Cache-Control。
 * 与 sitemap 一致：5min CDN + 浏览器（不带 s-maxage，RSS 由浏览器直接取）。
 */
export function setRssResponse(event: H3Event): void {
  setHeader(event, "Content-Type", "application/rss+xml; charset=utf-8");
  setHeader(event, "Cache-Control", PUBLIC_CACHE_CONTROL_SHORT);
}