import { getUser } from "#server/lib/auth";
import { DEFAULT_COMMENT_AVATAR_SERVICE, DEFAULT_COMMENT_PAGE_SIZE, DEFAULT_COMMENT_MAX_LEVEL, DEFAULT_COMMENT_INTERVAL, DEFAULT_FEED_CACHE_INTERVAL, CONTENT_PAGE_SIZE_DEFAULT, DEFAULT_SMTP_PORT, DEFAULT_UPLOAD_LOCATION, DEFAULT_SESSION_STORE_TYPE, DEFAULT_SEARCH_CACHE_EXPIRE } from "#shared/constants";
import { validateCsrfToken } from "#server/utils/csrf";
import { prisma } from "#server/utils/prisma";
import { validateSettingsData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { siteConfig } from "~~/site.config";

export default defineEventHandler(async event => {
  const body = (await readBody(event)) ?? {};
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

  // 用对象过滤重建，避免动态 delete（no-dynamic-delete）。设置值最终以字符串入库，
  // 布尔/数字在下方 updates 数组里 String() 化；此处统一收窄为 string|null|undefined。
  const filteredBody: Record<string, string | null | undefined> = {};
  for (const [key, v] of Object.entries(settingsBody)) {
    if (v === undefined || v === null) {
      filteredBody[key] = v;
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      filteredBody[key] = String(v);
    } else {
      throw createError({ statusCode: 400, message: `${key} 格式错误` });
    }
  }
  const settingsData = filteredBody;

  // 验证字段长度
  validateSettingsData(settingsData);

  try {
    const updates = [
      { key: "siteName", value: settingsData.siteName ?? siteConfig.site.name },
      { key: "siteUrl", value: settingsData.siteUrl ?? siteConfig.site.url },
      { key: "siteDesc", value: settingsData.siteDesc ?? siteConfig.seo.description },
      { key: "siteIcp", value: settingsData.siteIcp ?? "" },
      { key: "commentEnabled", value: String(settingsData.commentEnabled ?? true) },
      { key: "commentModeration", value: String(settingsData.commentModeration ?? false) },
      { key: "commentAvatarService", value: settingsData.commentAvatarService ?? DEFAULT_COMMENT_AVATAR_SERVICE },
      { key: "commentPageSize", value: String(settingsData.commentPageSize ?? DEFAULT_COMMENT_PAGE_SIZE) },
      { key: "commentMaxLevel", value: String(settingsData.commentMaxLevel ?? DEFAULT_COMMENT_MAX_LEVEL) },
      { key: "commentRequireMail", value: String(settingsData.commentRequireMail ?? true) },
      { key: "commentRequireLink", value: String(settingsData.commentRequireLink ?? false) },
      { key: "commentInterval", value: String(settingsData.commentInterval ?? DEFAULT_COMMENT_INTERVAL) },
      { key: "contentPageSize", value: String(settingsData.contentPageSize ?? CONTENT_PAGE_SIZE_DEFAULT) },
      { key: "feedCacheInterval", value: String(settingsData.feedCacheInterval ?? DEFAULT_FEED_CACHE_INTERVAL) },
      { key: "homeCustomText", value: settingsData.homeCustomText ?? siteConfig.pages.homeCustomText },
      { key: "musicPlaylistId", value: settingsData.musicPlaylistId ?? "" },
      { key: "photoCategorySlug", value: settingsData.photoCategorySlug ?? "" },
      { key: "moderationApiType", value: String(settingsData.moderationApiType ?? "1") },
      { key: "baiduApiKey", value: settingsData.baiduApiKey ?? "" },
      { key: "baiduSecretKey", value: settingsData.baiduSecretKey ?? "" },
      { key: "baiduCheckAdmin", value: String(settingsData.baiduCheckAdmin ?? false) },
      { key: "emailLogEnabled", value: String(settingsData.emailLogEnabled ?? true) },
      { key: "emailPushType", value: settingsData.emailPushType ?? "none" },
      { key: "smtpHost", value: settingsData.smtpHost ?? "" },
      { key: "smtpUser", value: settingsData.smtpUser ?? "" },
      { key: "smtpAddress", value: settingsData.smtpAddress ?? "" },
      { key: "smtpPassword", value: settingsData.smtpPassword ?? "" },
      { key: "smtpSecureMode", value: settingsData.smtpSecureMode ?? "tls" },
      { key: "smtpPort", value: String(settingsData.smtpPort ?? DEFAULT_SMTP_PORT) },
      { key: "smtpFromName", value: settingsData.smtpFromName ?? "" },
      { key: "adminEmail", value: settingsData.adminEmail ?? "" },
      { key: "notifyAdmin", value: String(settingsData.notifyAdmin ?? false) },
      { key: "uploadLocation", value: settingsData.uploadLocation === "cos" ? "cos" : DEFAULT_UPLOAD_LOCATION },
      { key: "cosSecretId", value: settingsData.cosSecretId ?? "" },
      { key: "cosSecretKey", value: settingsData.cosSecretKey ?? "" },
      { key: "cosBucket", value: settingsData.cosBucket ?? "" },
      { key: "cosRegion", value: settingsData.cosRegion ?? "" },
      { key: "cosSourceDomain", value: settingsData.cosSourceDomain ?? "" },
      { key: "cosCdnDomain", value: settingsData.cosCdnDomain ?? "" },
      { key: "cosImageSuffix", value: settingsData.cosImageSuffix ?? "" },
      { key: "sessionStoreType", value: settingsData.sessionStoreType ?? DEFAULT_SESSION_STORE_TYPE },
      { key: "messageContentId", value: settingsData.messageContentId ?? "" },
      { key: "linkAutoApprove", value: String(settingsData.linkAutoApprove ?? false) },
      { key: "searchCacheEnabled", value: String(settingsData.searchCacheEnabled ?? false) },
      { key: "searchCacheExpire", value: String(settingsData.searchCacheExpire ?? DEFAULT_SEARCH_CACHE_EXPIRE) },
    ];

    // 整批 upsert 包事务：中途失败整体回滚，避免保存半套不一致设置
    await prisma.$transaction(async tx => {
      for (const update of updates) {
        await tx.informations.upsert({
          where: { key: update.key },
          create: { key: update.key, value: update.value },
          update: { value: update.value },
        });
      }
    });

    // 站点设置变更 → 影响全站（header/footer/文案/链接数等），清空全部 ISR 页面缓存
    void invalidateContentCaches().catch(err => console.error("[cache] 站点设置失效缓存失败", err));

    return { success: true };
  } catch (error) {
    console.error(error);
    // 已带 statusCode 的错误（400/403）原样抛出，避免被统一吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "保存设置失败",
    });
  }
});
