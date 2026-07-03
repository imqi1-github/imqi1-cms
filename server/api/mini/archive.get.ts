import type { MiniArchiveMonthGroup, MiniArchivePost, MiniArchiveResponse } from "#server/types/apis/mini";
import { prisma } from "#server/utils/prisma";

function formatMonthTitle(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");

  return `${year} 年 ${month} 月`;
}

function formatDay(value: Date) {
  return String(value.getDate()).padStart(2, "0");
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const posts = await prisma.posts.findMany({
      where: {
        type: 0,
        status: 1,
      },
      orderBy: {
        create_time: "desc",
      },
      select: {
        cid: true,
        title: true,
        create_time: true,
      },
    });

    const groups = posts.reduce((acc, post) => {
      const title = formatMonthTitle(post.create_time);
      const item: MiniArchivePost = {
        id: post.cid,
        day: formatDay(post.create_time),
        title: post.title,
        created: post.create_time.toISOString(),
      };

      const group = acc[acc.length - 1]?.title === title
        ? acc[acc.length - 1]
        : null;

      if (group) {
        group.items.push(item);
      } else {
        acc.push({
          title,
          items: [item],
        });
      }

      return acc;
    }, [] as MiniArchiveMonthGroup[]);

    return {
      success: true,
      data: groups,
    } satisfies MiniArchiveResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序文章归档失败",
    });
  }
});
