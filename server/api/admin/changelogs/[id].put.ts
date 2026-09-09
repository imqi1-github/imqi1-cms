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

  const id = Number(getRouterParam(event, "id"));

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的日志 ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { csrfToken } = body as { csrfToken?: string };
  if (!validateCsrfToken(event, csrfToken ?? "")) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }
  // 前端发来 { content: [{ type, value }, ...] }，规整后校验
  const entries = normalizeChangelogEntries(body?.content);
  validateChangelogData(entries);

  try {
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

    // PG TEXT 无 65535 字节上限，此处仅保留防单条超大 changelog 的保守护栏（与 import.post 一致）
    const serialized = stringifyChangelogContent(entries);
    if (Buffer.byteLength(serialized, "utf8") > 65535) {
      throw createError({ statusCode: 400, message: "更新日志内容过长" });
    }

    // 更新日志
    await prisma.changelogs.update({
      where: { id },
      data: {
        content: serialized,
      },
    });

    // 更新日志变更 → 立即失效更新日志页/首页 ISR 缓存（best-effort）
    void invalidateContentCaches({ routes: ["/", "/changelogs"] }).catch(err => console.error("[cache] 更新日志更新失效缓存失败", err));

    return { success: true };
  } catch (error) {
    // 校验抛的 400 原样传递；update 与 findUnique 间的并发删除竞态 → P2025 → 404
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "更新日志不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "更新更新日志失败" });
  }
});
