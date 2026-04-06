import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 获取所有更新日志，按时间倒序
    const changelogs = await prisma.changelog.findMany({
      orderBy: {
        create_time: "desc",
      },
    });

    // 按月份分组
    const grouped = changelogs.reduce((acc, log) => {
      const date = new Date(log.create_time);
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

      acc[key].logs.push({
        id: log.id,
        class: log.class,
        desc: log.desc,
        createTime: log.create_time,
      });

      return acc;
    }, {} as Record<string, { year: number; month: number; logs: any[] }>);

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
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
