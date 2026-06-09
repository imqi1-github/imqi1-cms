import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    // 从 meta 表获取留言板关联的文章 ID
    const messagePostIdMeta = await prisma.informations.findUnique({
      where: { key: "messagePostId" },
    });

    // 如果没有配置，尝试通过 slug 查找留言板文章
    let messagePostId = messagePostIdMeta?.value ? parseInt(messagePostIdMeta.value) : null;

    if (!messagePostId) {
      const messagePost = await prisma.posts.findFirst({
        where: { slug: "messages" },
        select: { cid: true },
      });
      messagePostId = messagePost?.cid || null;
    }

    if (!messagePostId) {
      return {
        code: 404,
        message: "留言板未配置",
        data: null,
      };
    }

    return {
      code: 200,
      message: "获取成功",
      data: { postId: messagePostId },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取留言板配置失败",
    });
  }
});
