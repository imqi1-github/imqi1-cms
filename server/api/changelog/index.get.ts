import { prisma } from "#server/utils/prisma";
import MarkdownIt from "markdown-it";

// 创建简化版 Markdown 实例（仅支持基础格式）
const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: true,
});

// 简化版 Markdown 渲染（仅支持：粗体、斜体、删除线、行内代码、有序/无序列表）
function renderSimpleMarkdown(content: string): string {
  if (!content) {
    return "";
  }
  return md.render(content);
}

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = query.limit ? parseInt(query.limit as string) : undefined;
    const simple = query.simple === 'true'; // 是否返回简化格式（不分组）

    // 设置缓存头：CDN和浏览器缓存30分钟
    setHeader(event, "Cache-Control", "public, max-age=1800, s-maxage=1800");

    // 获取更新日志，按时间倒序
    const changelogsQuery: any = {
      orderBy: {
        create_time: "desc",
      },
    };

    // 如果指定了limit，只获取前N条
    if (limit) {
      changelogsQuery.take = limit;
    }

    const changelogs = await prisma.changelog.findMany(changelogsQuery);

    // 渲染所有 Markdown 内容（简化版，仅支持基础格式）
    const changelogsHtml = changelogs.map(log => ({
      ...log,
      descHtml: renderSimpleMarkdown(log.desc || ""),
    }));

    // 如果是simple模式，直接返回未分组的数组
    if (simple) {
      return {
        success: true,
        data: changelogsHtml,
      };
    }

    // 按月份分组
    const grouped = changelogsHtml.reduce((acc, log) => {
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
        descHtml: log.descHtml,
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
