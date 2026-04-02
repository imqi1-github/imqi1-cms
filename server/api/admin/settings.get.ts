import prisma from "#server/utils/prisma";

export default defineEventHandler(async () => {
  try {
    const metas = await prisma.meta.findMany();
    const settings: Record<string, any> = {
      siteName: "",
      siteDesc: "",
      siteKeywords: "",
      siteIcp: "",
      commentEnabled: true,
      commentModeration: false,
    };

    metas.forEach((meta: any) => {
      if (meta.key === "siteName") settings.siteName = meta.value;
      if (meta.key === "siteDesc") settings.siteDesc = meta.value;
      if (meta.key === "siteKeywords") settings.siteKeywords = meta.value;
      if (meta.key === "siteIcp") settings.siteIcp = meta.value;
      if (meta.key === "commentEnabled") settings.commentEnabled = meta.value === "true";
      if (meta.key === "commentModeration") settings.commentModeration = meta.value === "true";
    });

    return settings;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "获取设置失败",
    });
  }
});
