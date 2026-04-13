import { prisma } from "#server/utils/prisma";

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
      return {
        code: 404,
        message: "标签不存在",
        data: {
          tag: null,
          posts: [],
          pagination: null,
        },
      };
    }

    // 查询该标签的文章总数（通过 postrelation 表）
    const totalCount = await prisma.postrelation.count({
      where: {
        mid: tag.mid,
        post: {
          status: 1,
          type: 0,
        },
      },
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    // 查询文章（通过 postrelation 表）
    const postRelations = await prisma.postrelation.findMany({
      where: {
        mid: tag.mid,
        post: {
          status: 1,
          type: 0,
        },
      },
      include: {
        post: {
          include: {
            user: {
              select: {
                uid: true,
                name: true,
                nickname: true,
                avatar: true,
              },
            },
            postrelation: {
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
          },
        },
      },
      orderBy: {
        post: {
          create_time: "desc",
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 提取文章数据
    const posts = postRelations.map(relation => relation.post);

    // 格式化文章数据
    const formattedPosts = posts.map(post => {
      // 解析标签
      const postTags = post.tags ? post.tags.split(",").map(t => t.trim()).filter(t => t) : [];

      // 查找评论数量
      const commentsNum = post.comment_num || 0;

      // 解析封面（从 post.covers 字段）
      let covers = [];
      if (post.covers) {
        try {
          const parsed = JSON.parse(post.covers);
          if (Array.isArray(parsed)) {
            covers = parsed.map(item => ({
              url: item.url || item,
              desc: item.title || item.desc || '',
            }));
          }
        } catch {
          covers = post.covers.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            if (trimmed.includes('||')) {
              const [url, desc] = trimmed.split('||');
              return { url: url.trim(), desc: desc?.trim() || '' };
            }
            return { url: trimmed, desc: '' };
          }).filter(Boolean);
        }
      }

      // 获取分类信息（排除当前标签，只返回 type="category" 的）
      const categoryRelation = post.postrelation?.find(
        r => r.metas.type === "category"
      );
      const categoryName = categoryRelation?.metas?.name || null;
      const categorySlug = categoryRelation?.metas?.slug || null;

      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        updated: post.update_time,
        created: post.create_time,
        tags: postTags,
        commentsNum,
        covers,
        categoryName,
        categorySlug,
        user: post.user,
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
        posts: formattedPosts,
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
    console.error("获取标签文章失败:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "获取标签文章失败",
    });
  }
});
