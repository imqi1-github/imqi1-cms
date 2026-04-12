import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const categorySlug = getRouterParam(event, 'slug');
  const query = getQuery(event);

  if (!categorySlug) {
    throw createError({
      statusCode: 400,
      message: "分类 slug 不能为空",
    });
  }

  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 12;
  const skip = (page - 1) * pageSize;

  // 获取分类信息
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    select: {
      mid: true,
      name: true,
      slug: true,
      desc: true,
    },
  });

  if (!category) {
    throw createError({
      statusCode: 404,
      message: "分类不存在",
    });
  }

  // 获取该分类下的文章总数
  const total = await prisma.postrelation.count({
    where: {
      category: {
        slug: categorySlug,
      },
      post: {
        type: 0, // 0: 文章
        status: 1, // 只统计已发布的文章
      },
    },
  });

  // 获取该分类下的文章列表
  const relations = await prisma.postrelation.findMany({
    where: {
      category: {
        slug: categorySlug,
      },
      post: {
        type: 0, // 0: 文章
        status: 1,
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
            include: {
              category: {
                select: {
                  name: true,
                  slug: true,
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
        create_time: 'desc',
      },
    },
    skip,
    take: pageSize,
  });

  // 解析文章数据
  const posts = relations.map(relation => {
    const post = relation.post;
    let covers = [];

    // 解析封面
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

    // 从 postrelation 中获取标签（只取 type="tag" 的）
    const tagNames = post.postrelation
      ?.filter(r => r.category.type === "tag")
      .map(r => r.category.name) || [];

    return {
      cid: post.cid,
      title: post.title,
      slug: post.slug,
      desc: post.desc,
      created: post.create_time,
      updated: post.update_time,
      views: post.views,
      commentsNum: post.commentsNum || 0,
      many_covers: post.manyCovers === 'on',
      covers,
      tags: tagNames, // 保持为字符串数组，前端会处理
      user: post.user,
    };
  });

  return {
    success: true,
    data: {
      category,
      posts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    },
  };
});
