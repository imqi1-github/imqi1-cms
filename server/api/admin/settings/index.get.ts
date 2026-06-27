import { getUser } from "#server/lib/auth";
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
      postPageSize: 12,
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
      upyunDomain: siteConfig.cdnUrl,
      upyunService: "",
      upyunOperator: "",
      upyunPassword: "",
      upyunImageProcess: false,
      upyunThumbnailVersion: "",
      upyunOutputMode: "",
      upyunTokenEnabled: false,
      upyunTokenKey: "",
      upyunTokenExpire: 1800,
      cosSecretId: "",
      cosSecretKey: "",
      cosBucket: "",
      cosRegion: "",
      cosSourceDomain: "",
      cosCdnDomain: "",
      cosImageSuffix: "webp",
      sessionStoreType: "memory",
      messagePostId: "",
      linkAutoApprove: false,
      searchCacheEnabled: false,
      searchCacheExpire: 300,
    };

    const settings: Record<string, string | number | boolean> = { ...defaults };

    // 从数据库覆盖值
    meta.forEach((meta) => {
      if (!Object.hasOwn(settings, meta.key)) return;

      const value = meta.value;

      // 布尔值转换
      if (typeof defaults[meta.key] === "boolean") {
        settings[meta.key] = value === "true";
      }
      // 数字值转换
      else if (typeof defaults[meta.key] === "number") {
        const numValue = Number(value);
        settings[meta.key] = isNaN(numValue) ? defaults[meta.key] : numValue;
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
