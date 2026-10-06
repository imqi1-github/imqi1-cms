import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { logAdminAudit } from "#server/utils/audit";

/**
 * PATCH /api/admin/contents/[cid]/autosave —— 草稿云端自动保存。
 *
 * 设计：仅同步 content + update_time，不动标题/标签/封面等元数据。
 *  原因：草稿期间元数据可能尚未填全，全量替换会反向把空值覆盖回服务端。
 *
 * 安全：admin 鉴权 + CSRF（与 [cid].put 一致）。CSRF 失败 → 403。
 *
 * 缓存：不失效 ISR（status=0 草稿不被任何公开路由渲染，缓存不变；与 chat 内容更新隔离）。
 *
 * 写操作：仅写 content + update_time；status 保持原值（不改 0→1，避免误发）。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  const cidParam = getRouterParam(event, "cid");
  const cid = Number(cidParam);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw createError({ statusCode: 400, message: "文章 ID 不合法" });
  }

  const body = (await readBody(event)) ?? {};
  const { content: draftContent, csrfToken } = body;

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  // 仅接受字符串/null；非字符串直接拒（避免 Prisma 字段校验 500）
  if (draftContent !== undefined && draftContent !== null && typeof draftContent !== "string") {
    throw createError({ statusCode: 400, message: "content 格式错误" });
  }

  try {
    const updated = await prisma.contents.update({
      where: { cid },
      data: {
        // 只在明确传入字符串时写正文：省略字段不能把已有正文覆盖成 null（草稿同步是保守操作，
        // 宁可这次不同步也不能丢稿）
        ...(typeof draftContent === "string" ? { content: draftContent } : {}),
        update_time: new Date(),
      },
      select: { cid: true, update_time: true },
    });

    await logAdminAudit({

      actor: { uid: user.uid, name: user.name },

      action: "content.autosave",

      target: { type: "content", id: cid },

    });

    return {
      success: true,
      data: {
        cid: updated.cid,
        update_time: updated.update_time,
      },
    };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "文章不存在" });
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "草稿自动保存失败" });
  }
});