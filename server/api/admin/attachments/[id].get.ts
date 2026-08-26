import * as path from "path";

import prisma from "#server/utils/prisma";
import { normalizeAttachmentMetadata } from "#server/utils/attachmentMetadata";
import { getUser } from "#server/lib/auth";

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

    const attachment = await prisma.attachments.findUnique({
      where: { aid: id },
      include: {
        contentattachments: {
          select: {
            content: {
              select: {
                cid: true,
                title: true,
                slug: true,
                type: true,
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

    const metadata = normalizeAttachmentMetadata(attachment.metadata);
    const format = metadata.format ?? (attachment.type === "image"
      ? (() => {
          // path.extname 不解析 query/hash，直接作用在 URL 会把 `?size=large` 算进扩展名；
          // 先取 pathname 再取扩展名，非法 URL 兜底 null
          try {
            const pathname = new URL(attachment.url).pathname;
            return path.extname(pathname).toLowerCase().slice(1) || null;
          } catch {
            return null;
          }
        })()
      : null);

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: metadata.size,
        metadata,
        width: metadata.width,
        height: metadata.height,
        format,
        createdAt: attachment.create_time,
        contents: attachment.contentattachments.map(relation => relation.content),
      },
    };
  } catch (error) {
    // 已带 statusCode 的错误（401/400/404）原样抛，不打印完整堆栈
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    console.error(error);

    throw createError({
      statusCode: 500,
      message: "获取附件详情失败",
    });
  }
});
