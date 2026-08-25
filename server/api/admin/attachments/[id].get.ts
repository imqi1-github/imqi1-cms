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

    if (!id) {
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
      ? path.extname(attachment.url).toLowerCase().slice(1) || null
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
    console.error(error);

    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: error instanceof Error ? error.message : "获取附件详情失败",
    });
  }
});
