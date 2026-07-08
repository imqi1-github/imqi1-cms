import { siteConfig } from "~~/site.config";
import type { MiniContentDetail, MiniContentDetailResponse } from "#server/types/apis/mini";
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

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const idParam = getRouterParam(event, "id");
  const id = Number(idParam);

  if (!idParam || !Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: "文章 id 不合法",
    });
  }

  try {
    // 返回 Markdown 原文，由小程序端自行解析（前台详情页返回的是已渲染 HTML，
    // 但小程序无法使用 v-html，故此处保留原文交给端上轻量解析器）。
    const content = await prisma.contents.findFirst({
      where: { cid: id, type: 0, status: 1 },
      select: {
        cid: true,
        title: true,
        desc: true,
        content: true,
        covers: true,
        create_time: true,
        contentrelations: {
          where: { metas: { type: "category" } },
          select: {
            metas: {
              select: { mid: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!content) {
      throw createError({
        statusCode: 404,
        message: "文章不存在",
      });
    }

    const requestUrl = getRequestURL(event);
    // 全部封面转绝对地址并保留标题（desc）；cover 保留首图地址，兼容仅需单封面的场景
    const covers = parseCovers(content.covers)
      .map(item => ({
        url: toAbsoluteUrl(item.url, requestUrl.origin),
        title: item.desc,
      }))
      .filter(item => item.url);

    const categories = content.contentrelations
      .map(relation => relation.metas)
      .filter((meta): meta is NonNullable<typeof meta> => Boolean(meta))
      .map(meta => ({
        mid: meta.mid,
        name: meta.name,
        slug: meta.slug ?? "",
      }));

    const data: MiniContentDetail = {
      id: content.cid,
      title: content.title,
      description: content.desc ?? "",
      content: content.content ?? "",
      cover: covers[0]?.url ?? "",
      covers,
      categories,
      publishedAt: formatRelativeTime(content.create_time),
      created: content.create_time.toISOString(),
    };

    return {
      success: true,
      data,
    } satisfies MiniContentDetailResponse;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序文章详情失败",
    });
  }
});
