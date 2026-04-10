import { prisma } from "#server/utils/prisma";

// 默认值
const defaults: Record<string, any> = {
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteIcp: "",
  homeCustomText: '<p>做技术的分享者 · 生活的摄影师 · 时事的评论员</p>',
  photoCategorySlug: "shot",
  commentEnabled: true,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentInterval: 60,
  commentRequireMail: true,
  commentRequireLink: false,
  postPageSize: 12,
};

export default defineEventHandler(async event => {
  // 设置缓存头 - CDN 和浏览器缓存 5 分钟
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const metas = await prisma.meta.findMany({
      where: {
        key: { in: Object.keys(defaults) },
      },
    });

    const settings: Record<string, any> = { ...defaults };

    // 从数据库覆盖值
    metas.forEach((meta: any) => {
      if (settings.hasOwnProperty(meta.key)) {
        // 布尔值转换
        if (typeof defaults[meta.key] === "boolean") {
          settings[meta.key] = meta.value === "true";
        } else {
          settings[meta.key] = meta.value;
        }
      }
    });

    return { success: true, data: settings };
  } catch (error) {
    return { success: true, data: defaults };
  }
});
