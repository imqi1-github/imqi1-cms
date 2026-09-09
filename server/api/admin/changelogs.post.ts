import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { validateChangelogData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
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

  // PG TEXT 无 65535 字节上限，此处仅保留防单条超大 changelog 的保守护栏（与 import.post 一致）
  const serialized = stringifyChangelogContent(entries);
  if (Buffer.byteLength(serialized, "utf8") > 65535) {
    throw createError({ statusCode: 400, message: "更新日志内容过长" });
  }

  await prisma.changelogs.create({
    data: {
      content: serialized,
    },
  });

  // 更新日志变更 → 立即失效更新日志页/首页 ISR 缓存（best-effort）
  void invalidateContentCaches({ routes: ["/", "/changelogs"] }).catch(err => console.error("[cache] 更新日志创建失效缓存失败", err));

  return { success: true };
});
