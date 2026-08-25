import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    // 从 meta 表获取留言板关联的文章 ID（仅取 value，公开接口字段白名单）
    const messageContentIdMeta = await prisma.informations.findUnique({
      where: { key: "messageContentId" },
      select: { value: true },
    });

    // 解析为正向整数：非数字/0/负数一律回退到 slug 查找
    const parsedContentId = messageContentIdMeta?.value ? Number.parseInt(messageContentIdMeta.value, 10) : NaN;
    let messageContentId = Number.isFinite(parsedContentId) && parsedContentId > 0 ? parsedContentId : null;

    if (!messageContentId) {
      // 留言板是独立 /messages 路由（page 型 type:1），加 type/status 判别避免抓到同 slug 的文章
      const messageContent = await prisma.contents.findFirst({
        where: { slug: "messages", type: 1, status: 1 },
        select: { cid: true },
      });
      messageContentId = messageContent?.cid ?? null;
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
