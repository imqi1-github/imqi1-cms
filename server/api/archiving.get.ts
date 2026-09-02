import { prisma } from "#server/utils/prisma";
import type { ArchiveGroup } from "#server/types/apis/archiving";

export default defineEventHandler(async () => {
  try {
    // 获取所有已发布的文章（type=0），只取归档列表所需字段
    // 显式 select：避免默认拉出 content(LongText 正文)/covers/desc 等大字段，归档只需年月+标题
    const contents = await prisma.contents.findMany({
      where: {
        status: 1,
        type: 0,
      },
      select: {
        cid: true,
        title: true,
        slug: true,
        create_time: true,
        contentrelations: {
          where: {
            metas: { type: "category" },
          },
          // 只取分类 slug；cid/mid 是连接表外键，输出用不到，不拉（与 footprint.get.ts 同口径）
          select: {
            metas: {
              select: {
                slug: true,
              },
            },
          },
          take: 1,
          // 多分类文章取"第一个分类"：无 orderBy 时 LIMIT 1 为任意行，
          // 会让 /content/{categorySlug}/{slug} 链接跨请求不稳定。按 metas.mid 升序固定首分类。
          orderBy: {
            metas: { mid: "asc" },
          },
        },
      },
      orderBy: {
        create_time: "desc",
      },
    });

    // 按年月分组
    // 用 UTC 口径（getUTCFullYear/getUTCMonth），与前端 formatDate 的 getUTC* 对齐，
    // 避免服务端(UTC)分组与客户端(本地时区)显示跨月/跨日错位
    const grouped = contents.reduce((acc, content) => {
      const date = new Date(content.create_time);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
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
        createTime: content.create_time.toISOString(),
      });

      return acc;
    }, {} as Record<string, ArchiveGroup>);

    // 转换为数组并按日期排序
    const sortedGroups = Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    // 统计信息（前端仅使用 total）
    const stats = {
      total: contents.length,
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
