import type { MiniMessagesConfigResponse } from "#server/types/apis/mini";
import { isMiniFakeDataEnabled, miniCommentsEnabled } from "#server/utils/mini-fake-data";
import { prisma } from "#server/utils/prisma";

// 留言板即绑定到某篇文章的评论区，与主站 /api/messages/config 逻辑一致：
// 优先取 informations.messageContentId，否则回退到 slug 为 "messages" 的文章。
// 同时返回小程序评论开关，关闭时留言页与入口都不展示。
export default defineEventHandler(async () => {
  const commentEnabled = miniCommentsEnabled();

  // 审核模式：留言页必然关闭，也就不需要解析绑定哪篇文章，直接不查库
  if (isMiniFakeDataEnabled()) {
    return {
      success: true,
      data: { contentId: null, commentEnabled },
    } satisfies MiniMessagesConfigResponse;
  }

  try {
    const messageContentIdMeta = await prisma.informations.findUnique({
      where: { key: "messageContentId" },
      select: { value: true },
    });

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

    return {
      success: true,
      data: { contentId: messageContentId, commentEnabled },
    } satisfies MiniMessagesConfigResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序留言板配置失败",
    });
  }
});
