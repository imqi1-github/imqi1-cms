import { siteConfig } from "~~/site.config";
import type { MiniTravelsResponse } from "#server/types/apis/mini";
import { prisma } from "#server/utils/prisma";

function toAbsoluteUrl(url: string, origin: string) {
  if (!url) return "";

  try {
    return new URL(url).href;
  } catch {
    const base = process.env.NODE_ENV === "production"
      ? siteConfig.cdnUrl || siteConfig.siteUrl
      : origin;

    return new URL(url.startsWith("/") ? url : `/${url}`, base).href;
  }
}

async function getPhotoCategoryMid() {
  const photoCategorySlugInfo = await prisma.informations.findUnique({
    where: { key: "photoCategorySlug" },
    select: { value: true },
  });
  const photoCategorySlug = photoCategorySlugInfo?.value || "shot";

  const photoCategory = await prisma.metas.findFirst({
    where: { slug: photoCategorySlug },
    select: { mid: true },
  });

  return photoCategory?.mid;
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const origin = getRequestURL(event).origin;
    const photoCategoryMid = await getPhotoCategoryMid();

    const travels = await prisma.travels.findMany({
      where: { enabled: true },
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      include: {
        // contenttravels 关联表，需通过 .content 取到文章；只保留已发布普通文章。
        contenttravels: {
          where: {
            content: { type: 0, status: 1 },
          },
          select: {
            content: {
              select: {
                cid: true,
                title: true,
                // 关联的分类中是否含图片分类，用于端上判断图片文章
                contentrelations: {
                  where: photoCategoryMid ? { mid: photoCategoryMid } : { mid: -1 },
                  select: { mid: true },
                },
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: travels.map(t => ({
        id: t.id,
        name: t.name,
        desc: t.desc ?? "",
        cover: toAbsoluteUrl(t.cover ?? "", origin),
        contents: t.contenttravels.map(rel => ({
          id: rel.content.cid,
          title: rel.content.title,
          photo: rel.content.contentrelations.length > 0,
        })),
      })),
    } satisfies MiniTravelsResponse;
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序足迹列表失败",
    });
  }
});
