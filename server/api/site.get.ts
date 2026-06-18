import { prisma } from "#server/utils/prisma";
import { defineTypedApiHandler } from "#server/utils/typedApi";
import { SiteSettingsResponseSchema } from "./schemas";
import { sanitizeHtml } from "~~/lib/html";
import { siteConfig } from "~~/site.config";

// 默认值
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
  linkAutoApprove: false,
};

function sanitizePublicSettings(settings: Record<string, any>): Record<string, any> {
  return {
    ...settings,
    homeCustomText: sanitizeHtml(String(settings.homeCustomText || "")),
  };
}

export default defineTypedApiHandler(
  {
    response: SiteSettingsResponseSchema,
    description: "获取站点公共设置",
  },
  async (event) => {
  // 设置缓存头 - CDN 和浏览器缓存 5 分钟
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const meta = await prisma.informations.findMany({
      where: {
        key: { in: Object.keys(defaults) },
      },
    });

    const settings: Record<string, any> = { ...defaults };

    // 从数据库覆盖值
    meta.forEach((meta: any) => {
      if (settings.hasOwnProperty(meta.key)) {
        const value = meta.value;

        // 布尔值转换
        if (typeof defaults[meta.key] === "boolean") {
          settings[meta.key] = value === "true";
        }
        // 数字值转换 - 使用 isNaN 检查而不是 || 运算符，避免 0 被当作 falsy 值
        else if (typeof defaults[meta.key] === "number") {
          // 空字符串或 null 应该使用默认值
          if (value === "" || value === null || value === undefined) {
            settings[meta.key] = defaults[meta.key];
          } else {
            const numValue = Number(value);
            settings[meta.key] = isNaN(numValue) ? defaults[meta.key] : numValue;
          }
        }
        // 其他类型直接使用
        else {
          settings[meta.key] = value;
        }
      }
    });

    return { success: true, data: sanitizePublicSettings(settings) };
  } catch (error) {
    return { success: true, data: sanitizePublicSettings(defaults) };
  }
});
