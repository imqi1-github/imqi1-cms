import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

// 敏感配置项：GET 不回显真实值，只回显掩码（约定5 敏感配置运行时化 + 防密钥经浏览器/网络明文下发）。
// settings.post 会对这些字段做「掩码/空值 → 跳过更新」处理，避免回显的掩码被保存覆盖真实密钥。
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
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }
  try {
    const meta = await prisma.informations.findMany();

    // 默认值
    const defaults: Record<string, string | number | boolean> = {
      siteName: siteConfig.siteName,
      siteUrl: siteConfig.siteUrl,
      siteDesc: siteConfig.seo.description,
      siteIcp: "",
      commentEnabled: true,
      commentModeration: false,
      commentAvatarService: "gravatar",
      commentPageSize: 10,
      commentMaxLevel: 4,
      commentRequireMail: true,
      commentRequireLink: false,
      commentInterval: 60,
      contentPageSize: 12,
      feedCacheInterval: 8,
      homeCustomText: siteConfig.homeCustomText,
      musicPlaylistId: "9255074836 || netease",
      photoCategorySlug: "shot",
      moderationApiType: "1",
      baiduAppId: "",
      baiduApiKey: "",
      baiduSecretKey: "",
      baiduCheckAdmin: false,
      emailLogEnabled: true,
      emailPushType: "none",
      smtpHost: "",
      smtpUser: "",
      smtpAddress: "",
      smtpPassword: "",
      smtpSecureMode: "tls",
      smtpPort: 465,
      smtpFromName: "",
      adminEmail: "",
      notifyAdmin: false,
      uploadLocation: "local",
      cosSecretId: "",
      cosSecretKey: "",
      cosBucket: "",
      cosRegion: "",
      cosSourceDomain: "",
      cosCdnDomain: "",
      cosImageSuffix: "webp",
      sessionStoreType: "memory",
      messageContentId: "",
      linkAutoApprove: false,
      searchCacheEnabled: false,
      searchCacheExpire: 300,
    };

    const settings: Record<string, string | number | boolean> = { ...defaults };

    // 从数据库覆盖值
    meta.forEach((meta) => {
      if (!Object.hasOwn(settings, meta.key)) return;

      const value = meta.value;
      const defaultValue = defaults[meta.key];

      // 布尔值转换
      if (typeof defaultValue === "boolean") {
        settings[meta.key] = value === "true";
      }
      // 数字值转换
      else if (typeof defaultValue === "number") {
        const numValue = Number(value);
        settings[meta.key] = isNaN(numValue) ? defaultValue : numValue;
      }
      // 其他类型直接使用
      else {
        settings[meta.key] = value;
      }
    });

    // 敏感配置不回显真实值：非空则替换为掩码，空值保留空（前端可据此判断「未设置」）
    for (const key of SENSITIVE_KEYS) {
      if (settings[key]) settings[key] = MASK;
    }

    return settings;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取设置失败",
    });
  }
});
