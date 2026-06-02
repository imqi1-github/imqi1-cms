import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { prisma } from "#server/utils/prisma";
import { validateSettingsData } from "#server/utils/validation";

export default defineEventHandler(async event => {
  const body = await readBody(event);
  const { csrfToken, ...settingsBody } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  // 验证字段长度
  validateSettingsData(settingsBody);

  try {
    const updates = [
      { key: "siteName", value: settingsBody.siteName || "ImQi1" },
      { key: "siteUrl", value: settingsBody.siteUrl || "https://imqi1.com" },
      { key: "siteDesc", value: settingsBody.siteDesc || "做技术的分享者、生活的摄影师、时事的评论员。" },
      { key: "siteKeywords", value: settingsBody.siteKeywords || "棋,ImQi1,棋的小站,生活,科技,编程,学习" },
      { key: "siteIcp", value: settingsBody.siteIcp || "" },
      { key: "commentEnabled", value: String(settingsBody.commentEnabled ?? true) },
      { key: "commentModeration", value: String(settingsBody.commentModeration ?? false) },
      { key: "commentAvatarService", value: settingsBody.commentAvatarService || "gravatar" },
      { key: "commentPageSize", value: String(settingsBody.commentPageSize ?? 10) },
      { key: "commentMaxLevel", value: String(settingsBody.commentMaxLevel ?? 4) },
      { key: "commentRequireMail", value: String(settingsBody.commentRequireMail ?? true) },
      { key: "commentRequireLink", value: String(settingsBody.commentRequireLink ?? false) },
      { key: "commentInterval", value: String(settingsBody.commentInterval ?? 60) },
      { key: "postPageSize", value: String(settingsBody.postPageSize ?? 12) },
      { key: "feedCacheInterval", value: String(settingsBody.feedCacheInterval ?? 8) },
      { key: "homeCustomText", value: settingsBody.homeCustomText ?? '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>' },
      { key: "musicPlaylistId", value: settingsBody.musicPlaylistId ?? "9255074836 || netease" },
      { key: "photoCategorySlug", value: settingsBody.photoCategorySlug ?? "shot" },
      { key: "moderationApiType", value: String(settingsBody.moderationApiType ?? "1") },
      { key: "baiduAppId", value: settingsBody.baiduAppId ?? "" },
      { key: "baiduApiKey", value: settingsBody.baiduApiKey ?? "" },
      { key: "baiduSecretKey", value: settingsBody.baiduSecretKey ?? "" },
      { key: "baiduCheckAdmin", value: String(settingsBody.baiduCheckAdmin ?? false) },
      { key: "emailLogEnabled", value: String(settingsBody.emailLogEnabled ?? true) },
      { key: "emailPushType", value: settingsBody.emailPushType ?? "none" },
      { key: "smtpHost", value: settingsBody.smtpHost ?? "" },
      { key: "smtpUser", value: settingsBody.smtpUser ?? "" },
      { key: "smtpAddress", value: settingsBody.smtpAddress ?? "" },
      { key: "smtpPassword", value: settingsBody.smtpPassword ?? "" },
      { key: "smtpSecureMode", value: settingsBody.smtpSecureMode ?? "tls" },
      { key: "smtpPort", value: String(settingsBody.smtpPort ?? 465) },
      { key: "smtpFromName", value: settingsBody.smtpFromName ?? "" },
      { key: "adminEmail", value: settingsBody.adminEmail ?? "" },
      { key: "notifyAdmin", value: String(settingsBody.notifyAdmin ?? false) },
      { key: "uploadLocation", value: settingsBody.uploadLocation ?? "local" },
      { key: "upyunDomain", value: settingsBody.upyunDomain ?? "https://cdn.imqi1.com" },
      { key: "upyunService", value: settingsBody.upyunService ?? "" },
      { key: "upyunOperator", value: settingsBody.upyunOperator ?? "" },
      { key: "upyunPassword", value: settingsBody.upyunPassword ?? "" },
      { key: "upyunImageProcess", value: String(settingsBody.upyunImageProcess ?? false) },
      { key: "upyunThumbnailVersion", value: settingsBody.upyunThumbnailVersion ?? "" },
      { key: "upyunOutputMode", value: settingsBody.upyunOutputMode ?? "" },
      { key: "upyunTokenEnabled", value: String(settingsBody.upyunTokenEnabled ?? false) },
      { key: "upyunTokenKey", value: settingsBody.upyunTokenKey ?? "" },
      { key: "upyunTokenExpire", value: String(settingsBody.upyunTokenExpire ?? 1800) },
      { key: "cosSecretId", value: settingsBody.cosSecretId ?? "" },
      { key: "cosSecretKey", value: settingsBody.cosSecretKey ?? "" },
      { key: "cosBucket", value: settingsBody.cosBucket ?? "" },
      { key: "cosRegion", value: settingsBody.cosRegion ?? "" },
      { key: "cosSourceDomain", value: settingsBody.cosSourceDomain ?? "" },
      { key: "cosCdnDomain", value: settingsBody.cosCdnDomain ?? "" },
      { key: "cosImageSuffix", value: settingsBody.cosImageSuffix ?? "webp" },
      { key: "sessionStoreType", value: settingsBody.sessionStoreType || "memory" },
      { key: "messagePostId", value: settingsBody.messagePostId ?? "" },
      { key: "linkAutoApprove", value: String(settingsBody.linkAutoApprove ?? false) },
    ];

    for (const update of updates) {
      await prisma.information.upsert({
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
