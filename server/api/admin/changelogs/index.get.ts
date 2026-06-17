import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { renderSimpleMarkdown } from "#server/utils/markdown";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }
  try {
    const changelogs = await prisma.changelogs.findMany({
      orderBy: { create_time: "desc" },
    });

    // 渲染 Markdown 内容为 HTML
    return changelogs.map(log => ({
      ...log,
      descHtml: renderSimpleMarkdown(log.desc || ""),
    }));
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
