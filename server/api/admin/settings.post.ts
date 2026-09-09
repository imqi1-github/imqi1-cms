import { getUser } from "#server/lib/auth";
import { validateCsrfToken } from "#server/utils/csrf";
import { prisma } from "#server/utils/prisma";
import { validateSettingsData } from "#server/utils/validation";
import { invalidateContentCaches } from "#server/utils/content-cache";
import { siteConfig } from "~~/site.config";

// 敏感配置项：settings.get 回显的是掩码，若原样回存会覆盖真实密钥；
// 提交值为掩码或空时跳过这些字段的更新（保留 DB 原值），只有提交了非掩码新值才真正写入。
const SENSITIVE_KEYS = new Set([
  "smtpUser",
  "smtpPassword",
  "cosSecretId",
  "cosSecretKey",
  "baiduApiKey",
  "baiduSecretKey",
]);
const MASK = "********";

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

  // 敏感字段：提交值是掩码/空 → 剔除，避免覆盖真实值；否则校验类型（readBody 无运行时校验）。
  // 用对象过滤重建，避免动态 delete（no-dynamic-delete）。设置值最终以字符串入库，
  // 布尔/数字在下方 updates 数组里 String() 化；此处统一收窄为 string|null|undefined。
  const filteredBody: Record<string, string | null | undefined> = {};
  for (const [key, v] of Object.entries(settingsBody)) {
    if (SENSITIVE_KEYS.has(key)) {
      if (v === undefined || v === null || v === MASK || v === "") {
        continue; // 掩码/空：跳过，保留 DB 原值
      }
      if (typeof v !== "string") {
        throw createError({ statusCode: 400, message: `${key} 格式错误` });
      }
      filteredBody[key] = v;
    } else {
      // 非敏感字段：null/undefined 保留（让下方 `?? default` 生效）；非标量对象/数组直接拒 400，标量统一 String() 化
      if (v === undefined || v === null) {
        filteredBody[key] = v;
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        filteredBody[key] = String(v);
      } else {
        throw createError({ statusCode: 400, message: `${key} 格式错误` });
      }
    }
  }
  const settingsData = filteredBody;

  // 验证字段长度
  validateSettingsData(settingsData);

  try {
    const updates = [
      { key: "siteName", value: settingsData.siteName ?? siteConfig.siteName },
      { key: "siteUrl", value: settingsData.siteUrl ?? siteConfig.siteUrl },
      { key: "siteDesc", value: settingsData.siteDesc ?? siteConfig.seo.description },
      { key: "siteIcp", value: settingsData.siteIcp ?? "" },
      { key: "commentEnabled", value: String(settingsData.commentEnabled ?? true) },
      { key: "commentModeration", value: String(settingsData.commentModeration ?? false) },
      { key: "commentAvatarService", value: settingsData.commentAvatarService ?? "gravatar" },
      { key: "commentPageSize", value: String(settingsData.commentPageSize ?? 10) },
      { key: "commentMaxLevel", value: String(settingsData.commentMaxLevel ?? 4) },
      { key: "commentRequireMail", value: String(settingsData.commentRequireMail ?? true) },
      { key: "commentRequireLink", value: String(settingsData.commentRequireLink ?? false) },
      { key: "commentInterval", value: String(settingsData.commentInterval ?? 60) },
      { key: "contentPageSize", value: String(settingsData.contentPageSize ?? 12) },
      { key: "feedCacheInterval", value: String(settingsData.feedCacheInterval ?? 8) },
      { key: "homeCustomText", value: settingsData.homeCustomText ?? siteConfig.homeCustomText },
      { key: "musicPlaylistId", value: settingsData.musicPlaylistId ?? "9255074836 || netease" },
      { key: "photoCategorySlug", value: settingsData.photoCategorySlug ?? "shot" },
      { key: "moderationApiType", value: String(settingsData.moderationApiType ?? "1") },
      ...(settingsData.baiduAppId !== undefined ? [{ key: "baiduAppId", value: settingsData.baiduAppId ?? "" }] : []),
      ...(settingsData.baiduApiKey !== undefined ? [{ key: "baiduApiKey", value: settingsData.baiduApiKey ?? "" }] : []),
      ...(settingsData.baiduSecretKey !== undefined ? [{ key: "baiduSecretKey", value: settingsData.baiduSecretKey ?? "" }] : []),
      { key: "baiduCheckAdmin", value: String(settingsData.baiduCheckAdmin ?? false) },
      { key: "emailLogEnabled", value: String(settingsData.emailLogEnabled ?? true) },
      { key: "emailPushType", value: settingsData.emailPushType ?? "none" },
      { key: "smtpHost", value: settingsData.smtpHost ?? "" },
      // 敏感字段：settingsBody 里已剔除掩码/空值，此处仅当提交了真实新值才进 updates（用解构后仍在即代表有效）
      ...(settingsData.smtpUser !== undefined ? [{ key: "smtpUser", value: settingsData.smtpUser ?? "" }] : []),
      { key: "smtpAddress", value: settingsData.smtpAddress ?? "" },
      ...(settingsData.smtpPassword !== undefined ? [{ key: "smtpPassword", value: settingsData.smtpPassword ?? "" }] : []),
      { key: "smtpSecureMode", value: settingsData.smtpSecureMode ?? "tls" },
      { key: "smtpPort", value: String(settingsData.smtpPort ?? 465) },
      { key: "smtpFromName", value: settingsData.smtpFromName ?? "" },
      { key: "adminEmail", value: settingsData.adminEmail ?? "" },
      { key: "notifyAdmin", value: String(settingsData.notifyAdmin ?? false) },
      { key: "uploadLocation", value: settingsData.uploadLocation === "cos" ? "cos" : "local" },
      ...(settingsData.cosSecretId !== undefined ? [{ key: "cosSecretId", value: settingsData.cosSecretId ?? "" }] : []),
      ...(settingsData.cosSecretKey !== undefined ? [{ key: "cosSecretKey", value: settingsData.cosSecretKey ?? "" }] : []),
      { key: "cosBucket", value: settingsData.cosBucket ?? "" },
      { key: "cosRegion", value: settingsData.cosRegion ?? "" },
      { key: "cosSourceDomain", value: settingsData.cosSourceDomain ?? "" },
      { key: "cosCdnDomain", value: settingsData.cosCdnDomain ?? "" },
      { key: "cosImageSuffix", value: settingsData.cosImageSuffix ?? "webp" },
      { key: "sessionStoreType", value: settingsData.sessionStoreType ?? "memory" },
      { key: "messageContentId", value: settingsData.messageContentId ?? "" },
      { key: "linkAutoApprove", value: String(settingsData.linkAutoApprove ?? false) },
      { key: "searchCacheEnabled", value: String(settingsData.searchCacheEnabled ?? false) },
      { key: "searchCacheExpire", value: String(settingsData.searchCacheExpire ?? 300) },
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
