import { prisma } from "#server/utils/prisma";
import { siteConfig } from "~~/site.config";

export default defineEventHandler(async () => {
  try {
    const meta = await prisma.informations.findMany({
      where: {
        key: {
          in: ["siteName", "siteUrl"],
        },
      },
    });

    const settings: Record<string, string> = {
      siteName: siteConfig.siteName,
      siteUrl: siteConfig.siteUrl,
    };

    meta.forEach(meta => {
      settings[meta.key] = meta.value;
    });

    return settings;
  } catch (error) {
    console.error(error);
    return {
      siteName: siteConfig.siteName,
      siteUrl: siteConfig.siteUrl,
    };
  }
});
