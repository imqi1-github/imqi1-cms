import { prisma } from "#server/utils/prisma";
import type { ArchiveGroup } from "#server/types/apis/archiving";

export default defineEventHandler(async () => {
  try {
    // 获取所有已发布的文章（type=0），包含分类信息
    const contents = await prisma.contents.findMany({
      where: {
        status: 1,
        type: 0,
      },
      include: {
        contentrelations: {
          where: {
            metas: { type: "category" },
          },
          select: {
            cid: true,
            mid: true,
            metas: {
              select: {
                slug: true,
              },
            },
          },
          take: 1,
        },
      },
      orderBy: {
        create_time: "desc",
      },
    });

    // 按年月分组
    const grouped = contents.reduce((acc, content) => {
      const date = new Date(content.create_time);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;

      if (!acc[key]) {
        acc[key] = {
          year,
          month,
          contents: [],
        };
      }

      // 获取第一个分类的 slug
      const categorySlug = content.contentrelations && content.contentrelations.length > 0
        ? content.contentrelations[0]?.metas?.slug ?? null
        : null;

      acc[key].contents.push({
        cid: content.cid,
        title: content.title,
        slug: content.slug,
        categorySlug,
        createTime: content.create_time,
      });

      return acc;
    }, {} as Record<string, ArchiveGroup>);

    // 转换为数组并按日期排序
    const sortedGroups = Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    // 统计信息
    const stats = {
      total: contents.length,
      firstDate: contents.length > 0 ? contents[contents.length - 1]?.create_time ?? null : null,
      lastDate: contents.length > 0 ? contents[0]?.create_time ?? null : null,
    };

    return {
      success: true,
      data: {
        groups: sortedGroups,
        stats,
      },
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取归档失败",
    });
  }
});
