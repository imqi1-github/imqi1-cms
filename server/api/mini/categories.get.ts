import { siteConfig } from "~~/site.config";
import type { MiniCategoriesResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
import { prisma } from "#server/utils/prisma";

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

  try {
    const requestUrl = getRequestURL(event);

    const categories = await prisma.metas.findMany({
      where: {
        type: "category",
      },
      include: {
        _count: {
          select: { contentrelations: true },
        },
        contentrelations: {
          where: {
            content: { type: 0, status: 1 },
          },
          orderBy: {
            content: { create_time: "desc" },
          },
          take: 1,
          select: {
            content: {
              select: { title: true, covers: true },
            },
          },
        },
      },
      orderBy: {
        mid: "asc",
      },
    });

    return {
      success: true,
      data: categories.map(cat => {
        const latest = cat.contentrelations[0]?.content;
        const firstCover = latest ? parseCovers(latest.covers)[0] : undefined;

        return {
          mid: cat.mid,
          name: cat.name,
          slug: cat.slug ?? "",
          desc: cat.desc,
          contentCount: cat._count.contentrelations,
          cover: toAbsoluteUrl(firstCover?.url ?? "", requestUrl.origin),
          latestTitle: latest?.title ?? "",
        };
      }),
    } satisfies MiniCategoriesResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序分类列表失败",
    });
  }
});
