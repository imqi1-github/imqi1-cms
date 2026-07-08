import { createError, getQuery, getRouterParam } from "h3";

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

    if (!id) {
      throw createError({
        statusCode: 400,
        message: "无效的附件 ID",
      });
    }

    // CSRF 验证 - 从查询参数获取
    const query = getQuery(event);
    const csrfToken = query.csrfToken as string;
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

    const unlinkCid = Number(query.cid);
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
    console.error(error);

    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "删除失败";

    throw createError({
      statusCode: 500,
      message,
    });
  }
});
