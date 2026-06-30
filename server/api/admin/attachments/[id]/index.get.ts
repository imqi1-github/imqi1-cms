import * as path from "path";

import prisma from "#server/utils/prisma";
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
        posts: {
          select: {
            cid: true,
            title: true,
            slug: true,
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

    // 宽高暂未采集；格式由扩展名推断（本地与云存储均适用）
    const width: number | null = null;
    const height: number | null = null;
    const format = attachment.type === "image"
      ? path.extname(attachment.url).toLowerCase().slice(1) || null
      : null;

    return {
      success: true,
      data: {
        id: attachment.aid,
        name: attachment.title,
        type: attachment.type,
        url: attachment.url,
        size: attachment.size,
        width,
        height,
        format,
        createdAt: attachment.create_time,
        post: attachment.posts,
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
