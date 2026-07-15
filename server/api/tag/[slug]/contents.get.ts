import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const slug = getRouterParam(event, "slug");
    const query = getQuery(event);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 12;

    if (!slug) {
      throw createError({
        statusCode: 400,
        statusMessage: "标签slug不能为空",
      });
    }

    // 查询标签信息（从 category 表）
    const tag = await prisma.metas.findFirst({
      where: {
        slug,
        type: "tag",
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
          include: {
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
      skip: (page - 1) * pageSize,
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
      statusMessage: "获取标签文章失败",
    });
  }
});
