import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const slug = getRouterParam(event, "slug");
    const query = getQuery(event);

    // 页码/分页大小必须为有限正整数，避免负数/浮点/NaN/Infinity 传入 skip/take
    const page = Math.min(10000, Math.max(1, Math.floor(Number(query.page) || 1)));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(query.pageSize) || 12)));
    const skip = (page - 1) * pageSize;

    if (!slug) {
      throw createError({
        statusCode: 400,
        message: "标签slug不能为空",
      });
    }

    // 查询标签信息（从 category 表；metas.slug 全局唯一、分类与标签共用同一张表，
    // 必须按 type 过滤，否则传入某分类的 slug 也会命中它）
    const tag = await prisma.metas.findFirst({
      where: {
        slug,
        type: "tag",
      },
      select: {
        mid: true,
        name: true,
        slug: true,
        desc: true,
      },
    });

    if (!tag) {
      throw createError({
        statusCode: 404,
        message: "标签不存在",
      });
    }

    // 查询该标签的文章总数（通过 contentrelation 表）
    const totalCount = await prisma.contentrelations.count({
      where: {
        mid: tag.mid,
        content: {
          status: 1,
          type: 0,
        },
      },
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    // 查询文章（通过 contentrelation 表）
    const contentRelations = await prisma.contentrelations.findMany({
      where: {
        mid: tag.mid,
        content: {
          status: 1,
          type: 0,
        },
      },
      include: {
        content: {
          select: {
            cid: true,
            title: true,
            slug: true,
            desc: true,
            update_time: true,
            create_time: true,
            comment_num: true,
            many_covers: true,
            covers: true,
            // 关联的分类/标签信息（只取 slug + name + type，用于前端生成链接）
            contentrelations: {
              select: {
                cid: true,
                mid: true,
                metas: {
                  select: {
                    slug: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
            // 关联的启用地点数（封面角标用）
            travels: {
              where: { travel: { enabled: true } },
              select: { travel_id: true },
            },
          },
        },
      },
      orderBy: {
        content: {
          create_time: "desc",
        },
      },
      skip,
      take: pageSize,
    });

    // 提取文章数据
    const contents = contentRelations.map(relation => relation.content);

    // 格式化文章数据
    const formattedContents = contents.map(content => {
      // 查找评论数量
      const commentsNum = content.comment_num || 0;

      // 解析封面（从 content.covers 字段）
      const covers = parseCovers(content.covers);

      // 获取分类信息（排除当前标签，只返回 type="category" 的）
      const categoryRelation = content.contentrelations?.find(
        r => r.metas.type === "category"
      );
      const categoryName = categoryRelation?.metas?.name || null;
      const categorySlug = categoryRelation?.metas?.slug || null;

      return {
        cid: content.cid,
        title: content.title,
        slug: content.slug,
        desc: content.desc,
        updated: content.update_time,
        created: content.create_time,
        commentsNum,
        many_covers: content.many_covers,
        covers,
        travelCount: content.travels.length,
        categoryName,
        categorySlug,
      };
    });

    return {
      code: 200,
      message: "获取成功",
      data: {
        tag: {
          name: tag.name,
          slug: tag.slug,
          desc: tag.desc || `标签 "${tag.name}" 的相关文章`,
        },
        contents: formattedContents,
        pagination: {
          page,
          pageSize,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      },
    };
  } catch (error) {
    // 已知的 H3 错误（如上面的 404）直接透传，不吞成 500
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取标签文章失败",
    });
  }
});
