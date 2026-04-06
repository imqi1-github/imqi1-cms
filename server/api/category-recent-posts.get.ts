import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4; // 每个分类的文章数量
    const categoryCount = 3; // 取前3个mid最小的分类

    // 获取图片分类设置，用于排除
    const photoCategoryMeta = await prisma.meta.findUnique({
      where: { key: "photoCategorySlug" },
    });
    const photoCategorySlug = photoCategoryMeta?.value || "shot";

    // 获取图片分类的 mid
    const photoCategory = await prisma.category.findFirst({
      where: { slug: photoCategorySlug },
      select: { mid: true },
    });
    const photoCategoryMid = photoCategory?.mid;

    // 获取 mid 最小的前3个分类（排除图片分类）
    const categories = await prisma.category.findMany({
      where: {
        ...(photoCategoryMid && { mid: { not: photoCategoryMid } }),
      },
      orderBy: {
        mid: "asc",
      },
      take: categoryCount,
      select: {
        mid: true,
        name: true,
        slug: true,
      },
    });

    // 获取"最新发布的内容"中已显示的文章 cid
    const recentPostsLimit = 6;
    const recentPosts = await prisma.post.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
        ...(photoCategoryMid && {
          relations: {
            none: {
              mid: photoCategoryMid,
            },
          },
        }),
      },
      take: recentPostsLimit,
      orderBy: {
        create_time: "desc",
      },
      select: {
        cid: true,
      },
    });
    const excludeCids = recentPosts.map(p => p.cid);

    // 为每个分类获取最新文章
    const result = await Promise.all(
      categories.map(async category => {
        const posts = await prisma.post.findMany({
          where: {
            type: 0, // 0: 文章
            status: 1,
            cid: { notIn: excludeCids },
            relations: {
              some: {
                mid: category.mid,
              },
            },
          },
          take: limit,
          orderBy: {
            create_time: "desc",
          },
          include: {
            relations: {
              include: {
                category: {
                  select: {
                    mid: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        });

        const mappedPosts = posts.map(post => {
          const categories = post.relations.map(r => ({
            name: r.category.name,
            slug: r.category.slug,
          }));

          let covers: { url: string; desc?: string }[] = [];
          if (post.covers) {
            try {
              covers = JSON.parse(post.covers);
            } catch {
              covers = [];
            }
          }

          return {
            cid: post.cid,
            title: post.title,
            slug: post.slug,
            desc: post.desc,
            covers,
            created: post.create_time,
            categories,
          };
        });

        return {
          category: {
            mid: category.mid,
            name: category.name,
            slug: category.slug,
          },
          posts: mappedPosts,
        };
      })
    );

    // 过滤掉没有文章的分类
    const filteredResult = result.filter(r => r.posts.length > 0);

    return {
      success: true,
      data: filteredResult,
    };
  } catch (error) {
    console.error("获取分类最新文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
