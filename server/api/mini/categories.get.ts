import type { MiniCategoriesResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
import { toAbsoluteUrl } from "#server/utils/mini";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const requestUrl = getRequestURL(event);

    const categories = await prisma.metas.findMany({
      where: {
        type: "category",
      },
      select: {
        mid: true,
        name: true,
        slug: true,
        desc: true,
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

    // contentCount 须与下方 contentrelations 子查询同口径（仅已发布文章 type:0/status:1），
    // 否则用未过滤的 _count 会把草稿/页面也算进去，数字虚高。
    const publishedCounts = await prisma.contentrelations.groupBy({
      by: ["mid"],
      where: { content: { type: 0, status: 1 } },
      _count: { _all: true },
    });
    const countByMid = new Map(publishedCounts.map(r => [r.mid, r._count._all]));

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
          contentCount: countByMid.get(cat.mid) ?? 0,
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
