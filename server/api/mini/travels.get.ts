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
        // posts 为 posttravels[] 关联表，需通过 .post 取到文章；只保留已发布普通文章。
        posts: {
          where: {
            post: { type: 0, status: 1 },
          },
          select: {
            post: {
              select: {
                cid: true,
                title: true,
                // 关联的分类中是否含图片分类，用于端上判断图片文章
                postrelations: {
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
        posts: t.posts.map(rel => ({
          id: rel.post.cid,
          title: rel.post.title,
          photo: rel.post.postrelations.length > 0,
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
