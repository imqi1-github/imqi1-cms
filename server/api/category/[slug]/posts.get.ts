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
  const total = await prisma.postRelation.count({
    where: {
      category: {
        slug: categorySlug,
      },
      post: {
        status: 1, // 只统计已发布的文章
      },
    },
  });

  // 获取该分类下的文章列表
  const relations = await prisma.postRelation.findMany({
    where: {
      category: {
        slug: categorySlug,
      },
      post: {
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

    // 解析标签
    const tags = post.tags
      ? post.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

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
      tags,
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
