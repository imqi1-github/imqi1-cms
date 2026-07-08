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

    const query = getQuery(event);
    const cid = Number(query.cid);

    if (!cid) {
      throw createError({
        statusCode: 400,
        message: "缺少文章 ID",
      });
    }

    // 检查文章是否存在
    const content = await prisma.contents.findUnique({
      where: { cid },
    });

    if (!content) {
      throw createError({
        statusCode: 404,
        message: "文章不存在",
      });
    }

    // 获取附件列表
    const attachments = await prisma.attachments.findMany({
      where: {
        contentattachments: {
          some: { cid },
        },
      },
      orderBy: { create_time: "desc" },
    });

    return {
      success: true,
      data: attachments.map(a => {
        const metadata = normalizeAttachmentMetadata(a.metadata);
        return {
          id: a.aid,
          name: a.title,
          type: a.type,
          url: a.url,
          size: metadata.size,
          metadata,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          create_time: a.create_time,
        };
      }),
    };
  } catch (error) {
    console.error(error);

    const message = error instanceof Error ? error.message : String(error);

    throw createError({
      statusCode: 500,
      message,
    });
  }
});
