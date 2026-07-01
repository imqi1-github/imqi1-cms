import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateChangelogData } from "#server/utils/validation";
import {
  normalizeChangelogEntries,
  stringifyChangelogContent,
} from "#server/utils/changelog";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = Number(getRouterParam(event, "id"));

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "ID 不能为空",
    });
  }

  const body = await readBody(event);
  // 前端发来 { content: [{ type, value }, ...] }，规整后校验
  const entries = normalizeChangelogEntries(body?.content);
  validateChangelogData(entries);

  // 检查日志是否存在
  const existing = await prisma.changelogs.findUnique({
    where: { id },
  });

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: "更新日志不存在",
    });
  }

  // 更新日志
  const changelog = await prisma.changelogs.update({
    where: { id },
    data: {
      content: stringifyChangelogContent(entries),
    },
  });

  return {
    success: true,
    data: changelog,
  };
});
