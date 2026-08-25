import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
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

  const body = (await readBody(event)) ?? {};
  const { csrfToken } = body as { csrfToken?: string };
  if (!validateCsrfToken(event, csrfToken ?? "")) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }
  // 前端发来 { content: [{ type, value }, ...] }，规整后校验、入库
  const entries = normalizeChangelogEntries(body?.content);
  validateChangelogData(entries);

  await prisma.changelogs.create({
    data: {
      content: stringifyChangelogContent(entries),
    },
  });

  return { success: true };
});
