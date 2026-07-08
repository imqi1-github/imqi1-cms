import path from "node:path";

import { siteConfig } from "~~/site.config";
import type { MiniCategoryContent, MiniCategoryContentsResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { prisma } from "#server/utils/prisma";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;
const month = 30 * day;
const year = 365 * day;

function formatRelativeTime(value: Date) {
  const diff = Date.now() - value.getTime();

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  if (diff < month) return `${Math.floor(diff / week)} 周前`;
  if (diff < year) return `${Math.floor(diff / month)} 个月前`;

  return `${Math.floor(diff / year)} 年前`;
}

function toAbsoluteUrl(url: string, origin: string) {
  if (!url) return "";

  try {
    return new URL(url).href;
  } catch {
    const base = process.env.NODE_ENV === "production"
      ? siteConfig.cdnUrl || siteConfig.siteUrl
      : origin;

    return new URL(url.startsWith("/") ? url : `/${url}`, base).href;
  }
}

const stripUrlDecorations = (value: string) => {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
};

const normalizePathname = (value: string) => {
  const clean = stripUrlDecorations(value);
  try {
    return new URL(clean).pathname;
  } catch {
    return clean;
  }
};

const normalizeObjectKey = (value: string) => {
  return decodeURIComponent(normalizePathname(value).replace(/^\/+/, ""));
};

const buildUrlKeys = (url: string) => {
  const key = normalizeObjectKey(url);
  const candidates = [key];

  if (!key.startsWith("uploads/")) {
    candidates.push(`uploads/${key}`);

    const fileName = path.basename(key);
    const datedName = /^(\d{4})-(\d{2})-\d{2}-/.exec(fileName);
    if (datedName) {
      candidates.push(`uploads/${datedName[1]}/${datedName[2]}/${fileName}`);
    }
  } else {
    candidates.push(key.replace(/^uploads\//, ""));
  }

  const fileName = path.basename(key);
  if (fileName) {
    candidates.push(fileName);
  }

  return new Set(candidates.filter(Boolean));
};

const hasSharedUrlKey = (a: Set<string>, b: Set<string>) => {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
};

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const categorySlug = getRouterParam(event, "slug");
  const query = getQuery(event);

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 12));
  const skip = (page - 1) * pageSize;

  try {
    const category = await prisma.metas.findUnique({
      where: { slug: categorySlug, type: "category" },
      select: { mid: true, name: true, slug: true, desc: true },
    });

    if (!category) {
      throw createError({
        statusCode: 404,
        message: "分类不存在",
      });
    }

    const contentWhere = {
      metas: { slug: categorySlug, type: "category" },
      content: { type: 0, status: 1 },
    };

    const total = await prisma.contentrelations.count({ where: contentWhere });

    const requestUrl = getRequestURL(event);
    const relations = await prisma.contentrelations.findMany({
      where: contentWhere,
      include: {
        content: {
          select: {
            cid: true,
            title: true,
            covers: true,
            create_time: true,
            attachments: {
              where: { attachment: { type: "image" } },
              select: {
                attachment: {
                  select: { url: true, metadata: true },
                },
              },
            },
          },
        },
      },
      orderBy: {
        content: { create_time: "desc" },
      },
      skip,
      take: pageSize,
    });

    const contents: MiniCategoryContent[] = relations.map(relation => {
      const content = relation.content;

      const attachmentMetadata = content.attachments.map(item => ({
        keys: buildUrlKeys(item.attachment.url),
        metadata: normalizeAttachmentMetadata(item.attachment.metadata),
      }));

      const firstCover = parseCovers(content.covers)[0];
      const coverCount = parseCovers(content.covers).length;
      let coverWidth = firstCover?.width ?? null;
      let coverHeight = firstCover?.height ?? null;

      if (firstCover && (!coverWidth || !coverHeight)) {
        const coverKeys = buildUrlKeys(firstCover.url);
        const matched = attachmentMetadata.find(item => hasSharedUrlKey(item.keys, coverKeys));
        if (matched) {
          coverWidth = matched.metadata.width;
          coverHeight = matched.metadata.height;
        }
      }

      return {
        id: content.cid,
        title: content.title,
        cover: toAbsoluteUrl(firstCover?.url ?? "", requestUrl.origin),
        coverCount,
        coverWidth,
        coverHeight,
        publishedAt: formatRelativeTime(content.create_time),
        created: content.create_time.toISOString(),
      };
    });

    return {
      success: true,
      data: {
        category: {
          mid: category.mid,
          name: category.name,
          slug: category.slug ?? categorySlug,
          desc: category.desc,
        },
        contents,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    } satisfies MiniCategoryContentsResponse;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序分类文章失败",
    });
  }
});
