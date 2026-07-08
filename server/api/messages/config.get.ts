import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    // 从 meta 表获取留言板关联的文章 ID
    const messageContentIdMeta = await prisma.informations.findUnique({
      where: { key: "messageContentId" },
    });

    // 如果没有配置，尝试通过 slug 查找留言板文章
    let messageContentId = messageContentIdMeta?.value ? parseInt(messageContentIdMeta.value) : null;

    if (!messageContentId) {
      const messageContent = await prisma.contents.findFirst({
        where: { slug: "messages" },
        select: { cid: true },
      });
      messageContentId = messageContent?.cid || null;
    }

    if (!messageContentId) {
      return {
        code: 404,
        message: "留言板未配置",
        data: null,
      };
    }

    return {
      code: 200,
      message: "获取成功",
      data: { contentId: messageContentId },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取留言板配置失败",
    });
  }
});
