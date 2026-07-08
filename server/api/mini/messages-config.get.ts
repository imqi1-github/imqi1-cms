import type { MiniMessagesConfigResponse } from "#server/types/apis/mini";
import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

// 留言板即绑定到某篇文章的评论区，与主站 /api/messages/config 逻辑一致：
// 优先取 informations.messagePostId，否则回退到 slug 为 "messages" 的文章。
// 同时返回小程序评论总开关 features.miniComment，关闭时留言页与入口都不展示。
export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  // 小程序评论总开关（编译期常量，与 comments.get / comments.post 一致）
  const commentEnabled = siteConfig.features.miniComment;

  try {
    const messagePostIdMeta = await prisma.informations.findUnique({
      where: { key: "messagePostId" },
    });

    let messagePostId = messagePostIdMeta?.value ? parseInt(messagePostIdMeta.value) : null;

    if (!messagePostId) {
      const messagePost = await prisma.contents.findFirst({
        where: { slug: "messages" },
        select: { cid: true },
      });
      messagePostId = messagePost?.cid ?? null;
    }

    return {
      success: true,
      data: { contentId: messagePostId, commentEnabled },
    } satisfies MiniMessagesConfigResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序留言板配置失败",
    });
  }
});
