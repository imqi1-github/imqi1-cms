import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    // 禁用缓存（每次都要随机，不能缓存）
    setHeader(event, "Cache-Control", "no-cache, no-store, must-revalidate");

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
        contentrelations: {
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
    return {
      success: false,
      data: null,
    };
  }
});
