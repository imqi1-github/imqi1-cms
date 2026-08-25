import { createError, getHeader, getQuery, getRouterParam } from "h3";

import { getUser } from "#server/lib/auth";
import { deleteAttachmentFile } from "#server/utils/attachment-file";
import { validateCsrfToken } from "#server/utils/csrf";
import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const user = await getUser(event);
    if (!user) {
      throw createError({
        statusCode: 401,
        message: "未登录",
      });
    }

    const id = Number(getRouterParam(event, "id"));

    if (!Number.isInteger(id) || id <= 0) {
      throw createError({
        statusCode: 400,
        message: "无效的附件 ID",
      });
    }

    // CSRF 验证 - 从请求头获取（避免 token 进入 URL 被日志/Referer 记录）
    const csrfToken = getHeader(event, "x-csrf-token") as string;
    const query = getQuery(event);
    if (!validateCsrfToken(event, csrfToken)) {
      throw createError({
        statusCode: 403,
        message: "CSRF token 验证失败，请刷新页面重试",
      });
    }

    // 获取附件信息
    const attachment = await prisma.attachments.findUnique({
      where: { aid: id },
      include: {
        contentattachments: {
          select: {
            cid: true,
            content: {
              select: {
                uid: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw createError({
        statusCode: 404,
        message: "附件不存在",
      });
    }

    // 仅接受正整数 cid，避免把 float/negative/NaN 传给 Prisma 的 where
    const rawCid = Number(query.cid);
    const unlinkCid = Number.isInteger(rawCid) && rawCid > 0 ? rawCid : 0;
    if (unlinkCid) {
      const content = await prisma.contents.findUnique({
        where: { cid: unlinkCid },
        select: { uid: true },
      });

      if (!content) {
        throw createError({
          statusCode: 404,
          message: "文章不存在",
        });
      }

      if (content.uid !== user.uid) {
        throw createError({
          statusCode: 403,
          message: "无权取消关联此附件",
        });
      }

      await prisma.contentattachments.deleteMany({
        where: {
          aid: id,
          cid: unlinkCid,
        },
      });

      return {
        success: true,
        message: "取消关联成功",
        detached: true,
      };
    } else if (attachment.contentattachments.length > 0 && !attachment.contentattachments.some(relation => relation.content.uid === user.uid)) {
      // 验证附件所有权：只有关联文章作者才能全局删除附件；无关联附件允许已登录管理员删除
      throw createError({
        statusCode: 403,
        message: "无权删除此附件",
      });
    }

    await deleteAttachmentFile(attachment);

    // 删除数据库记录；关联表记录通过级联删除
    await prisma.attachments.delete({
      where: { aid: id },
    });

    return {
      success: true,
      message: "删除成功",
    };
  } catch (error) {
    // 预期的 400/403/404 原样抛出，不打印完整堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({
        statusCode: 404,
        message: "附件不存在",
      });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "删除失败",
    });
  }
});
