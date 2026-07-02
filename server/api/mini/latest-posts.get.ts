import { siteConfig } from "~~/site.config";
import type { MiniLatestPost, MiniLatestPostsResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
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

async function getPhotoCategoryMid() {
  const photoCategorySlugInfo = await prisma.informations.findUnique({
    where: { key: "photoCategorySlug" },
    select: { value: true },
  });
  const photoCategorySlug = photoCategorySlugInfo?.value || "shot";

  const photoCategory = await prisma.metas.findFirst({
    where: { slug: photoCategorySlug },
    select: { mid: true },
  });

  return photoCategory?.mid;
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const photoCategoryMid = await getPhotoCategoryMid();
    const requestUrl = getRequestURL(event);
    const posts = await prisma.posts.findMany({
      where: {
        type: 0,
        status: 1,
        ...(photoCategoryMid && {
          postrelations: {
            none: { mid: photoCategoryMid },
          },
        }),
      },
      take: 6,
      orderBy: { create_time: "desc" },
      select: {
        cid: true,
        title: true,
        covers: true,
        create_time: true,
      },
    });

    const data: MiniLatestPost[] = posts.map(post => {
      const cover = parseCovers(post.covers)[0]?.url ?? "";

      return {
        id: post.cid,
        title: post.title,
        cover: toAbsoluteUrl(cover, requestUrl.origin),
        publishedAt: formatRelativeTime(post.create_time),
        created: post.create_time.toISOString(),
      };
    });

    return {
      success: true,
      data,
    } satisfies MiniLatestPostsResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序最新文章失败",
    });
  }
});
