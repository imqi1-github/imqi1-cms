import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

// 默认值配置
const defaults: Record<string, any> = {
  siteName: siteConfig.siteName,
  siteUrl: siteConfig.siteUrl,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  homeCustomText: siteConfig.homeCustomText,
  photoCategorySlug: "shot",
  commentEnabled: true,
  commentAvatarService: "gravatar",
  commentPageSize: 10,
  commentMaxLevel: 4,
  commentInterval: 60,
  commentRequireMail: true,
  commentRequireLink: false,
  postPageSize: 12,
  feedCacheInterval: 8,
};

export default defineEventHandler(async event => {
  if (event.method !== "POST") {
    throw createError({
      statusCode: 405,
      message: "方法不允许",
    });
  }

  try {
    // 获取数据库中已有的配置项
    const existingKeys = await prisma.informations.findMany({
      select: { key: true },
    });

    const existingKeySet = new Set(existingKeys.map(item => item.key));
    const createdItems: { key: string; value: string }[] = [];

    // 找出缺失的配置项
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!existingKeySet.has(key)) {
        // 将默认值转换为字符串存储
        const stringValue = typeof defaultValue === "boolean" ? (defaultValue ? "true" : "false") : String(defaultValue);

        createdItems.push({ key, value: stringValue });
      }
    }

    // 批量创建缺失的配置项
    if (createdItems.length > 0) {
      await prisma.informations.createMany({
        data: createdItems,
      });
    }

    return {
      success: true,
      message: createdItems.length > 0 ? `已初始化 ${createdItems.length} 个配置项` : "所有配置项已存在",
      data: {
        created: createdItems,
        total: Object.keys(defaults).length,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "初始化配置失败",
    });
  }
});
