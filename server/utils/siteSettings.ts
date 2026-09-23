import { prisma } from "#server/utils/prisma";
import { DEFAULT_COMMENT_AVATAR_SERVICE, DEFAULT_COMMENT_PAGE_SIZE, DEFAULT_COMMENT_MAX_LEVEL, DEFAULT_COMMENT_INTERVAL, DEFAULT_FEED_CACHE_INTERVAL, CONTENT_PAGE_SIZE_DEFAULT } from "#shared/constants";
import type { SiteSettings, SettingKey, MutableSettings, MetaItem } from "#server/types/apis/setting";
import { sanitizeHtml } from "#shared/html";
import { siteConfig } from "~~/site.config";

// 站点公共设置的强类型默认值
const defaults: SiteSettings = {
  siteName: siteConfig.site.name,
  siteUrl: siteConfig.site.url,
  siteDesc: siteConfig.seo.description,
  siteIcp: "",
  homeCustomText: siteConfig.pages.homeCustomText,
  photoCategorySlug: "",
  commentEnabled: true,
  commentAvatarService: DEFAULT_COMMENT_AVATAR_SERVICE,
  commentPageSize: DEFAULT_COMMENT_PAGE_SIZE,
  commentMaxLevel: DEFAULT_COMMENT_MAX_LEVEL,
  commentInterval: DEFAULT_COMMENT_INTERVAL,
  commentRequireMail: true,
  commentRequireLink: false,
  contentPageSize: CONTENT_PAGE_SIZE_DEFAULT,
  feedCacheInterval: DEFAULT_FEED_CACHE_INTERVAL,
  linkAutoApprove: false,
  musicPlaylistId: "",
};

function sanitizePublicSettings(settings: MutableSettings): SiteSettings {
  return {
    ...settings,
    homeCustomText: sanitizeHtml(String(settings.homeCustomText || "")),
  } as SiteSettings;
}

/**
 * 读取站点公共设置（合并数据库覆盖值与默认值）。
 *
 * handler(server/api/site.get.ts) 与 SSR 预取插件共用本函数，
 * 直连数据库、不经过 HTTP，避免 SSR 时"自己 fetch 自己"的往返。
 * DB 异常时回退到默认值（与原 handler 行为一致）。
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  try {
    const meta = (await prisma.informations.findMany({
      where: {
        key: { in: Object.keys(defaults) as SettingKey[] },
      },
    })) as MetaItem[];

    const settings: MutableSettings = {
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

    return sanitizePublicSettings(settings);
  } catch (error) {
    console.error(error);
    return sanitizePublicSettings(defaults);
  }
}
