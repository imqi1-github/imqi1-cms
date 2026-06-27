import { SiteSettingsResponseSchema } from "./schemas";

import { prisma } from "#server/utils/prisma";
import { defineTypedApiHandler } from "#server/utils/typedApi";
import { sanitizeHtml } from "~~/lib/html";
import { siteConfig } from "~~/site.config";

// 1. 先定义 key 类型（核心）
type SettingKey =
  | "siteName"
  | "siteUrl"
  | "siteDesc"
  | "siteIcp"
  | "homeCustomText"
  | "photoCategorySlug"
  | "commentEnabled"
  | "commentAvatarService"
  | "commentPageSize"
  | "commentMaxLevel"
  | "commentInterval"
  | "commentRequireMail"
  | "commentRequireLink"
  | "postPageSize"
  | "feedCacheInterval"
  | "linkAutoApprove";

// 2. 强类型 defaults
const defaults: Record<SettingKey, string | boolean | number> = {
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

// 3. DB 返回类型收紧
type MetaItem = {
  key: SettingKey;
  value: string;
};

function sanitizePublicSettings(settings: Record<SettingKey, string | boolean | number>): Record<SettingKey, string | boolean | number> {
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
  async event => {
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    try {
      const meta = (await prisma.informations.findMany({
        where: {
          key: { in: Object.keys(defaults) as SettingKey[] },
        },
      })) as MetaItem[];

      const settings: Record<SettingKey, string | boolean | number> = {
        ...defaults,
      };

      for (const item of meta) {
        const key = item.key;
        const defaultValue = defaults[key];

        // boolean
        if (typeof defaultValue === "boolean") {
          settings[key] = item.value === "true";
          continue;
        }

        // number
        if (typeof defaultValue === "number") {
          if (item.value === "" || item.value == null) {
            settings[key] = defaultValue;
          } else {
            const num = Number(item.value);
            settings[key] = Number.isNaN(num) ? defaultValue : num;
          }
          continue;
        }

        // string
        settings[key] = item.value;
      }

      return {
        success: true,
        data: sanitizePublicSettings(settings),
      };
    } catch (error) {
      console.error(error);
      return {
        success: true,
        data: sanitizePublicSettings(defaults),
      };
    }
  },
);
