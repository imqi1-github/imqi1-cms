import { getUser } from "#server/lib/auth";
import { DEFAULT_COMMENT_AVATAR_SERVICE, DEFAULT_COMMENT_PAGE_SIZE, DEFAULT_COMMENT_MAX_LEVEL, DEFAULT_COMMENT_INTERVAL, DEFAULT_FEED_CACHE_INTERVAL, CONTENT_PAGE_SIZE_DEFAULT, DEFAULT_SMTP_PORT, DEFAULT_UPLOAD_LOCATION, DEFAULT_SESSION_STORE_TYPE, DEFAULT_SEARCH_CACHE_EXPIRE } from "#shared/constants";
import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

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
      siteName: siteConfig.site.name,
      siteUrl: siteConfig.site.url,
      siteDesc: siteConfig.seo.description,
      siteIcp: "",
      commentEnabled: true,
      commentModeration: false,
      commentAvatarService: DEFAULT_COMMENT_AVATAR_SERVICE,
      commentPageSize: DEFAULT_COMMENT_PAGE_SIZE,
      commentMaxLevel: DEFAULT_COMMENT_MAX_LEVEL,
      commentRequireMail: true,
      commentRequireLink: false,
      commentInterval: DEFAULT_COMMENT_INTERVAL,
      contentPageSize: CONTENT_PAGE_SIZE_DEFAULT,
      feedCacheInterval: DEFAULT_FEED_CACHE_INTERVAL,
      homeCustomText: siteConfig.pages.homeCustomText,
      musicPlaylistId: "",
      photoCategorySlug: "",
      moderationApiType: "1",
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
      smtpPort: DEFAULT_SMTP_PORT,
      smtpFromName: "",
      adminEmail: "",
      notifyAdmin: false,
      uploadLocation: DEFAULT_UPLOAD_LOCATION,
      cosSecretId: "",
      cosSecretKey: "",
      cosBucket: "",
      cosRegion: "",
      cosSourceDomain: "",
      cosCdnDomain: "",
      cosImageSuffix: "",
      sessionStoreType: DEFAULT_SESSION_STORE_TYPE,
      messageContentId: "",
      linkAutoApprove: false,
      searchCacheEnabled: false,
      searchCacheExpire: DEFAULT_SEARCH_CACHE_EXPIRE,
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

    return settings;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取设置失败",
    });
  }
});
