import prisma from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const body = await readBody(event);

  try {
    const updates = [
      { key: "siteName", value: body.siteName || "ImQi1" },
      { key: "siteUrl", value: body.siteUrl || "https://imqi1.com" },
      { key: "siteDesc", value: body.siteDesc || "做技术的分享者、生活的摄影师、时事的评论员。" },
      { key: "siteKeywords", value: body.siteKeywords || "棋,ImQi1,棋的小站,生活,科技,编程,学习" },
      { key: "siteIcp", value: body.siteIcp || "" },
      { key: "commentEnabled", value: String(body.commentEnabled ?? true) },
      { key: "commentModeration", value: String(body.commentModeration ?? false) },
      { key: "commentMarkdown", value: String(body.commentMarkdown ?? false) },
      { key: "commentAvatarService", value: body.commentAvatarService || "gravatar" },
      { key: "commentPageSize", value: String(body.commentPageSize ?? 10) },
      { key: "commentMaxLevel", value: String(body.commentMaxLevel ?? 4) },
      { key: "commentRequireMail", value: String(body.commentRequireMail ?? true) },
      { key: "commentRequireLink", value: String(body.commentRequireLink ?? false) },
      { key: "commentInterval", value: String(body.commentInterval ?? 60) },
    ];

    for (const update of updates) {
      await prisma.meta.upsert({
        where: { key: update.key },
        create: { key: update.key, value: update.value },
        update: { value: update.value },
      });
    }

    return { success: true };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "保存设置失败",
    });
  }
});
