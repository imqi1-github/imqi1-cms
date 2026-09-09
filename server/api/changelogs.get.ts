import { prisma } from "#server/utils/prisma";
import { renderChangelogContent } from "#server/utils/changelog";
import type { ChangelogGroup } from "#server/types/apis/changelog";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    // limit 收紧为 [1,100] 的整数，避免 NaN/负数/浮点/超大值传给 Prisma take；
    // 未传 limit 或空串 → 返回全部（保持原契约）
    const rawLimit = query.limit;
    const limit =
      typeof rawLimit === "string" && rawLimit.trim() !== ""
        ? Math.min(100, Math.max(1, Math.floor(Number(rawLimit)) || 1))
        : undefined;
    const simple = query.simple === "true"; // 是否返回简化格式（不分组）

    // 设置缓存头：CDN和浏览器缓存30分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 获取更新日志，按时间倒序（公开接口只取前台渲染所需字段）
    const changelogs = await prisma.changelogs.findMany({
      select: { id: true, content: true, create_time: true },
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
