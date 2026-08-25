import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";

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
      message: "缺少友链ID",
    });
  }
  const linkId = Number(id);
  if (!Number.isInteger(linkId) || linkId <= 0) {
    throw createError({
      statusCode: 400,
      message: "无效的友链ID",
    });
  }

  const body = (await readBody(event)) ?? {};
  const { action, csrfToken } = body; // "approve" 或 "reject"

  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  if (action !== "approve" && action !== "reject") {
    throw createError({
      statusCode: 400,
      message: "无效的操作",
    });
  }

  try {
    // 查找修改请求（不 include originalLink：该关联结果未被使用，属死查询）
    const modification = await prisma.links.findUnique({
      where: { id: linkId },
      select: {
        id: true,
        name: true,
        link: true,
        desc: true,
        avatar: true,
        originalLinkId: true,
        isModification: true,
      },
    });

    if (!modification) {
      throw createError({
        statusCode: 404,
        message: "修改请求不存在",
      });
    }

    if (!modification.isModification) {
      throw createError({
        statusCode: 400,
        message: "这不是一个修改请求",
      });
    }

    if (!modification.originalLinkId) {
      throw createError({
        statusCode: 400,
        message: "缺少原友链ID",
      });
    }

    if (action === "approve") {
      // 批准修改：更新原友链 + 删除修改请求，需原子（同成同败）
      await prisma.$transaction(async tx => {
        await tx.links.update({
          where: { id: modification.originalLinkId! },
          data: {
            name: modification.name,
            link: modification.link,
            desc: modification.desc,
            avatar: modification.avatar,
          },
        });

        // 删除修改请求
        await tx.links.delete({
          where: { id: linkId },
        });
      });

      return {
        success: true,
        message: "已批准修改，原友链已更新",
      };
    } else {
      // 拒绝修改：更新状态并删除修改请求
      await prisma.links.delete({
        where: { id: linkId },
      });

      return {
        success: true,
        message: "已拒绝修改请求",
      };
    }
  } catch (error) {
    // 已带 statusCode 的错误（400/404）原样抛出，避免被统一吞成 500
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    // 原友链已删 / 修改请求被并发删除 → P2025 → 404
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "原友链或修改请求不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "审核失败",
    });
  }
});
