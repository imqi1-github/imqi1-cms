import { prisma } from "#server/utils/prisma";

// 默认值
const defaults: Record<string, any> = {
  siteName: "ImQi1",
  siteUrl: "https://imqi1.com",
  siteDesc: "做技术的分享者、生活的摄影师、时事的评论员。",
  siteIcp: "",
  homeHeroSubtitle: "做技术的分享者 · 生活的摄影师 · 时事的评论员",
};

export default defineEventHandler(async event => {
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
        settings[meta.key] = meta.value;
      }
    });

    return { success: true, data: settings };
  } catch (error) {
    return { success: true, data: defaults };
  }
});
