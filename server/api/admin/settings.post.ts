import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);

  // 调试日志
  console.log('[设置保存] upyunImageProcess 原始值:', body.upyunImageProcess, '类型:', typeof body.upyunImageProcess);

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
      { key: "postPageSize", value: String(body.postPageSize ?? 12) },
      { key: "homeCustomText", value: body.homeCustomText ?? '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>' },
      { key: "staticFilePath", value: body.staticFilePath ?? "https://cdn.imqi1.com/static" },
      { key: "musicPlaylistId", value: body.musicPlaylistId ?? "9255074836 || netease" },
      { key: "photoCategorySlug", value: body.photoCategorySlug ?? "shot" },
      { key: "photoCoverSuffix", value: body.photoCoverSuffix ?? "!600px.width" },
      { key: "postCoverSuffix", value: body.postCoverSuffix ?? "!1000px" },
      { key: "moderationApiType", value: String(body.moderationApiType ?? "1") },
      { key: "baiduAppId", value: body.baiduAppId ?? "" },
      { key: "baiduApiKey", value: body.baiduApiKey ?? "" },
      { key: "baiduSecretKey", value: body.baiduSecretKey ?? "" },
      { key: "baiduCheckAdmin", value: String(body.baiduCheckAdmin ?? false) },
      { key: "emailLogEnabled", value: String(body.emailLogEnabled ?? true) },
      { key: "emailPushType", value: body.emailPushType ?? "none" },
      { key: "smtpHost", value: body.smtpHost ?? "" },
      { key: "smtpUser", value: body.smtpUser ?? "" },
      { key: "smtpAddress", value: body.smtpAddress ?? "" },
      { key: "smtpPassword", value: body.smtpPassword ?? "" },
      { key: "smtpSecureMode", value: body.smtpSecureMode ?? "tls" },
      { key: "smtpPort", value: String(body.smtpPort ?? 465) },
      { key: "smtpFromName", value: body.smtpFromName ?? "" },
      { key: "adminEmail", value: body.adminEmail ?? "" },
      { key: "notifyAdmin", value: String(body.notifyAdmin ?? false) },
      { key: "uploadLocation", value: body.uploadLocation ?? "local" },
      { key: "upyunDomain", value: body.upyunDomain ?? "https://cdn.imqi1.com" },
      { key: "upyunService", value: body.upyunService ?? "" },
      { key: "upyunOperator", value: body.upyunOperator ?? "" },
      { key: "upyunPassword", value: body.upyunPassword ?? "" },
      { key: "upyunImageProcess", value: String(body.upyunImageProcess ?? false) },
      { key: "upyunThumbnailVersion", value: body.upyunThumbnailVersion ?? "" },
      { key: "upyunOutputMode", value: body.upyunOutputMode ?? "" },
      { key: "upyunTokenEnabled", value: String(body.upyunTokenEnabled ?? false) },
      { key: "upyunTokenKey", value: body.upyunTokenKey ?? "" },
      { key: "upyunTokenExpire", value: String(body.upyunTokenExpire ?? 1800) },
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
