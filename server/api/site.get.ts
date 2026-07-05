import { SiteSettingsResponseSchema } from "./schemas";

import { defineTypedApiHandler } from "#server/types/typedApi";
import { getSiteSettings } from "#server/utils/siteSettings";

export default defineTypedApiHandler(
  {
    response: SiteSettingsResponseSchema,
    description: "获取站点公共设置",
  },
  async event => {
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    return {
      success: true,
      data: await getSiteSettings(),
    };
  },
);
