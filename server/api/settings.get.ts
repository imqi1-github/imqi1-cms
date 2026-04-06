import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const metas = await prisma.meta.findMany({
      where: {
        key: {
          in: ['siteName', 'siteUrl'],
        },
      },
    });

    const settings: Record<string, string> = {
      siteName: "ImQi1",
      siteUrl: "https://imqi1.com",
    };

    metas.forEach((meta: any) => {
      settings[meta.key] = meta.value;
    });

    return settings;
  } catch (error) {
    return {
      siteName: "ImQi1",
      siteUrl: "https://imqi1.com",
    };
  }
});
