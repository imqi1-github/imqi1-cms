import { prisma } from "#server/utils/prisma";
import { parseChangelogContent } from "#server/utils/changelog";
import type { MiniChangelogGroup, MiniChangelogsResponse } from "#server/types/apis/mini";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    // 与主站 /api/changelogs 同源，按时间倒序取全部更新日志
    const changelogs = await prisma.changelogs.findMany({
      orderBy: { create_time: "desc" },
      select: {
        id: true,
        content: true,
        create_time: true,
      },
    });

    // 解析 content（JSON 条目数组）为纯文本条目，小程序端直接展示不走 markdown
    const parsed = changelogs.map(log => ({
      id: log.id,
      createTime: log.create_time.toISOString(),
      entries: parseChangelogContent(log.content),
    }));

    // 按月份分组（最近月份在前）
    const grouped = new Map<string, MiniChangelogGroup>();
    for (const log of parsed) {
      const date = new Date(log.createTime);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;

      let group = grouped.get(key);
      if (!group) {
        group = { year, month, logs: [] };
        grouped.set(key, group);
      }
      group.logs.push(log);
    }

    const data = [...grouped.values()].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return {
      success: true,
      data,
    } satisfies MiniChangelogsResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序更新日志失败",
    });
  }
});
