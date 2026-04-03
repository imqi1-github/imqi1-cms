import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const metas = await prisma.meta.findMany();
    const settings: Record<string, any> = {
      siteName: "ImQi1",
      siteUrl: "https://imqi1.com",
      siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
      siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
      siteIcp: "",
      commentEnabled: true,
      commentModeration: false,
      commentMarkdown: false,
      commentAvatarService: "gravatar",
      commentPageSize: 10,
      commentMaxLevel: 4,
      commentRequireMail: true,
      commentRequireLink: false,
      commentInterval: 60,
    };

    metas.forEach((meta: any) => {
      if (meta.key === "siteName") settings.siteName = meta.value;
      if (meta.key === "siteUrl") settings.siteUrl = meta.value;
      if (meta.key === "siteDesc") settings.siteDesc = meta.value;
      if (meta.key === "siteKeywords") settings.siteKeywords = meta.value;
      if (meta.key === "siteIcp") settings.siteIcp = meta.value;
      if (meta.key === "commentEnabled") settings.commentEnabled = meta.value === "true";
      if (meta.key === "commentModeration") settings.commentModeration = meta.value === "true";
      if (meta.key === "commentMarkdown") settings.commentMarkdown = meta.value === "true";
      if (meta.key === "commentAvatarService") settings.commentAvatarService = meta.value;
      if (meta.key === "commentPageSize") settings.commentPageSize = Number(meta.value) || 10;
      if (meta.key === "commentMaxLevel") settings.commentMaxLevel = Number(meta.value) || 4;
      if (meta.key === "commentRequireMail") settings.commentRequireMail = meta.value === "true";
      if (meta.key === "commentRequireLink") settings.commentRequireLink = meta.value === "true";
      if (meta.key === "commentInterval") settings.commentInterval = Number(meta.value) || 60;
    });

    return settings;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取设置失败",
    });
  }
});
