import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { renderChangelogContent } from "#server/utils/changelog";

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

    // 解析 content（JSON 条目数组）并渲染每条 value 的 markdown
    return changelogs.map(log => ({
      id: log.id,
      content: renderChangelogContent(log.content),
      createTime: log.create_time,
    }));
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取更新日志失败",
    });
  }
});
