import { prisma, isPrismaNotFoundError } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { logAdminAudit } from "#server/utils/audit";
import { CSRF_HEADER } from "#shared/constants";

/**
 * DELETE /api/admin/likes/[cid]/[id] —— 后台单条删除点赞（清理刷赞 / 误操作 / 测试残留）。
 *
 * 路径为嵌套资源（文章 cid 下的点赞 id）：与同目录 [cid].get.ts 共用动态段，
 * 若平级用 [id] 会与 [cid] 参数名冲突（h3 radix 路由同位置只保留先注册的参数名）。
 *
 * 安全：CSRF + admin 鉴权；两个路径参数都必须是正整数；audit 记录 fingerprint 前 8 字符。
 *
 * 失效：点赞数批量接口（/api/likes/counts）+ 文章详情 + 各列表页。
 */
export default defineEventHandler(async event => {
  const user = await getUser(event);
  if (!user) {
    throw createError({ statusCode: 401, message: "请先登录" });
  }

  const cid = Number(getRouterParam(event, "cid"));
  const id = Number(getRouterParam(event, "id"));
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: "路径参数非法" });
  }

  // CSRF 验证（DELETE 从 header 读）
  const csrfToken = getHeader(event, CSRF_HEADER) as string;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({ statusCode: 403, message: "CSRF token 验证失败，请刷新页面重试" });
  }

  try {
    const record = await prisma.likes.findUnique({
      where: { id },
      select: { id: true, cid: true, fingerprint: true },
    });

    if (!record || record.cid !== cid) {
      throw createError({ statusCode: 404, message: "点赞记录不存在" });
    }

    await prisma.likes.delete({ where: { id } });

    // 同 likes/[cid].post：不再失效页面缓存（整组 /content/** 清空会逼出 Shiki 全量重渲染），
    // 前台数字由详情页挂载刷新 / 列表角标 ISR 窗口内收敛；后台数字本接口 no-store 实时。

    logAdminAudit({
      actor: { uid: user.uid, name: user.name },
      action: "like.delete",
      target: { type: "like", id },
      diff: { cid: record.cid, fp8: record.fingerprint.slice(0, 8) },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) throw error;
    if (isPrismaNotFoundError(error)) {
      throw createError({ statusCode: 404, message: "点赞记录不存在" });
    }
    console.error("[admin/likes.delete] 删除点赞失败:", error);
    throw createError({ statusCode: 500, message: "删除点赞失败" });
  }
});