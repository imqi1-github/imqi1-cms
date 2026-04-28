import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

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
    const meta = await prisma.information.findMany();

    // 默认值
    const defaults: Record<string, any> = {
      siteName: "ImQi1",
      siteUrl: "https://imqi1.com",
      siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
      siteKeywords: "棋,ImQi1,棋的小站,生活,科技,编程,学习",
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
      homeCustomText: '<p>本站小程序上新，欢迎扫码体验，亦可在微信中搜索"ImQi1"。</p>',
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
      upyunDomain: "https://cdn.imqi1.com",
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
    };

    const settings: Record<string, any> = { ...defaults };

    // 从数据库覆盖值
    meta.forEach((meta: any) => {
      if (!settings.hasOwnProperty(meta.key)) return;

      const value = meta.value;

      // 布尔值转换
      if (typeof defaults[meta.key] === "boolean") {
        settings[meta.key] = value === "true";
      }
      // 数字值转换
      else if (typeof defaults[meta.key] === "number") {
        settings[meta.key] = Number(value) || defaults[meta.key];
      }
      // 其他类型直接使用
      else {
        settings[meta.key] = value;
      }
    });

    return settings;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取设置失败",
    });
  }
});
