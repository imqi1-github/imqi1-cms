import {prisma} from "#server/utils/prisma";
import {getUser} from "#server/lib/auth";
import {validateCsrfToken} from "#server/utils/csrf";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少链接 ID",
    });
  }
  const linkId = Number(id);
  if (!Number.isInteger(linkId) || linkId <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的链接 ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const {csrfToken} = body;
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  try {
    const link = await prisma.links.findUnique({
      where: { id: linkId },
      select: { id: true, enabled: true },
    });

    if (!link) {
      throw createError({
        statusCode: 404,
        message: "链接不存在",
      });
    }

    // 条件式原子翻转：只有当前 enabled 与预读一致才翻，避免并发/重试各自读到同一旧值互相抵消
    const result = await prisma.links.updateMany({
      where: { id: linkId, enabled: link.enabled },
      data: { enabled: !link.enabled },
    });

    if (result.count === 0) {
      // 行仍存在但 enabled 已被并发改动 → 覆盖意图作废，提示刷新而非静默丢一次切换
      const still = await prisma.links.findUnique({ where: { id: linkId }, select: { id: true } });
      if (!still) {
        throw createError({ statusCode: 404, message: "链接不存在" });
      }
      throw createError({ statusCode: 409, message: "链接状态已更新，请刷新后重试" });
    }

    // 只返回最小变更集（id/enabled），不裸返回整行内部审核字段
    return { id: linkId, enabled: !link.enabled };
  } catch (error) {
    // 已带 statusCode 的错误（404）原样抛出，避免被统一吞成 500
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // findUnique 与 update 间并发删除竞态 → P2025 → 404
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "链接不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "更新链接失败",
    });
  }
});
