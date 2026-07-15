import { prisma } from "#server/utils/prisma";
import { renderChangelogContent } from "#server/utils/changelog";
import type { ChangelogGroup } from "#server/types/apis/changelog";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = query.limit ? parseInt(query.limit as string) : undefined;
    const simple = query.simple === "true"; // 是否返回简化格式（不分组）

    // 设置缓存头：CDN和浏览器缓存30分钟
    setHeader(event, "Cache-Control", "public, max-age=1800, s-maxage=1800");

    // 获取更新日志，按时间倒序
    const changelogs = await prisma.changelogs.findMany({
      orderBy: {
        create_time: "desc",
      },
      ...(limit ? { take: limit } : {}),
    });

    // 解析 content（JSON 条目数组）并渲染每条 value 的 markdown
    // 公开接口只下发前台渲染所需的 type + html，不回传 value（markdown 源码，前台不用，属冗余传输）
    const changelogsParsed = changelogs.map(log => ({
      id: log.id,
      content: renderChangelogContent(log.content).map(entry => ({
        type: entry.type,
        html: entry.html,
      })),
      createTime: log.create_time,
    }));

    // 如果是simple模式，直接返回未分组的数组
    if (simple) {
      return {
        success: true,
        data: changelogsParsed,
      };
    }

    // 按月份分组
    const grouped: Record<string, ChangelogGroup> = changelogsParsed.reduce(
      (acc, log) => {
        const date = new Date(log.createTime);
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-11
        const key = `${year}-${String(month + 1).padStart(2, "0")}`;

        if (!acc[key]) {
          acc[key] = {
            year,
            month: month + 1,
            logs: [],
          };
        }

        acc[key].logs.push(log);

        return acc;
      },
      {} as Record<string, ChangelogGroup>,
    );

    // 转换为数组并排序（最近的月份在前）
    const sortedGroups = Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    return {
      success: true,
      data: sortedGroups,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
