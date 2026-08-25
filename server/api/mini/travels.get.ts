import type { MiniTravelsResponse } from "#server/types/apis/mini";
import { getPhotoCategoryMid, toAbsoluteUrl } from "#server/utils/mini";
import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  try {
    const origin = getRequestURL(event).origin;
    const photoCategoryMid = await getPhotoCategoryMid();

    const travels = await prisma.travels.findMany({
      where: { enabled: true },
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      select: {
        id: true,
        name: true,
        desc: true,
        cover: true,
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
    // 已携带 statusCode 的错误（如内部 createError）原样上抛，勿吞成通用 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取小程序足迹列表失败",
    });
  }
});
