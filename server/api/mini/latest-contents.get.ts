import type { MiniLatestContent, MiniLatestContentsResponse } from "#server/types/apis/mini";
import { parseCovers } from "#server/utils/covers";
import { formatRelativeTime, getPhotoCategoryMid, toAbsoluteUrl } from "#server/utils/mini";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const photoCategoryMid = await getPhotoCategoryMid();
    const requestUrl = getRequestURL(event);
    const contents = await prisma.contents.findMany({
      where: {
        type: 0,
        status: 1,
        ...(photoCategoryMid && {
          contentrelations: {
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

    const data: MiniLatestContent[] = contents.map(content => {
      const cover = parseCovers(content.covers)[0]?.url ?? "";

      return {
        id: content.cid,
        title: content.title,
        cover: toAbsoluteUrl(cover, requestUrl.origin),
        publishedAt: formatRelativeTime(content.create_time),
        created: content.create_time.toISOString(),
      };
    });

    return {
      success: true,
      data,
    } satisfies MiniLatestContentsResponse;
  } catch (error) {
    // 预期 4xx 原样抛，不打印完整堆栈
    if (error instanceof Error && 'statusCode' in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序最新文章失败",
    });
  }
});
