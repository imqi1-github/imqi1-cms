import { setResponseHeader } from "h3";

import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    // 禁用缓存（每次都要随机，不能缓存）
    setResponseHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate");

    const total = await prisma.contents.count({
      where: {
        type: 0, // 0: 文章
        status: 1,
      },
    });

    if (total === 0) {
      return {
        success: false,
        data: null,
      };
    }

    const skip = Math.floor(Math.random() * total);

    const contents = await prisma.contents.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
      },
      skip,
      take: 1,
      select: {
        cid: true,
        title: true,
        slug: true,
        desc: true,
        covers: true,
        // 只取分类关系：contentrelations 同时承接 tag 与 category，
        // 若无 metas.type 过滤，category = contentrelations[0] 可能取到标签而非分类，
        // 导致首页随机文章跳转/展示到 tag 路由。orderBy 保证 [0] 确定性。
        contentrelations: {
          where: { metas: { type: "category" } },
          orderBy: { mid: "asc" },
          select: {
            cid: true,
            mid: true,
            metas: {
              select: {
                mid: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        // 关联的启用地点数（首页随机文章封面角标用）
        travels: {
          where: { travel: { enabled: true } },
          select: { travel_id: true },
        },
      },
    });

    const content = contents[0];

    if (!content) {
      return {
        success: false,
        data: null,
      };
    }

    const category = content.contentrelations[0]?.metas;

    const covers = parseCovers(content.covers);

    return {
      success: true,
      data: {
        cid: content.cid,
        title: content.title,
        slug: content.slug,
        desc: content.desc,
        covers,
        travelCount: content.travels.length,
        category: category
          ? {
              name: category.name,
              slug: category.slug,
            }
          : null,
      },
    };
  } catch (error) {
    console.error(error);
    // 未知故障统一 500，绝不把 error.message / 内部详情透传给客户端，
    // 避免把 DB 故障吞成 200 success:false。
    throw createError({
      statusCode: 500,
      message: "生成随机文章失败",
    });
  }
});
