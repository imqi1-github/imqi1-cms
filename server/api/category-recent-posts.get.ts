import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4; // 每个分类的文章数量
    const categoryCount = 3; // 取前3个mid最小的分类

    // 设置缓存头：CDN和浏览器缓存10分钟
    setHeader(event, "Cache-Control", "public, max-age=600, s-maxage=600");

    // 获取图片分类设置，用于排除
    const photoCategoryMeta = await prisma.informations.findUnique({
      where: { key: "photoCategorySlug" },
    });
    const photoCategorySlug = photoCategoryMeta?.value || "shot";

    // 获取图片分类的 mid
    const photoCategory = await prisma.metas.findFirst({
      where: { slug: photoCategorySlug },
      select: { mid: true },
    });
    const photoCategoryMid = photoCategory?.mid;

    // 获取 mid 最小的前3个分类（排除图片分类）
    const categories = await prisma.metas.findMany({
      where: {
        type: "category",
        ...(photoCategoryMid && { mid: { not: photoCategoryMid } }),
      },
      orderBy: {
        mid: "asc",
      },
      take: categoryCount,
      select: {
        mid: true,
        desc: true,
        name: true,
        slug: true,
      },
    });

    // 获取"最新发布的内容"中已显示的文章 cid
    const recentPostsLimit = 6;
    const recentPosts = await prisma.posts.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
        ...(photoCategoryMid && {
          postrelations: {
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

    // 优化：一次性获取所有分类的文章，而不是为每个分类单独查询
    const allPosts = await prisma.posts.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
        cid: { notIn: excludeCids },
        postrelations: {
          some: {
            mid: { in: categories.map(c => c.mid) },
          },
        },
      },
      take: limit * categories.length, // 最多获取所有分类的文章数
      orderBy: {
        create_time: "desc",
      },
      select: {
        cid: true,
        title: true,
        slug: true,
        desc: true,
        covers: true,
        create_time: true,
        comment_num: true,
        postrelations: {
          select: {
            cid: true,
            mid: true,
            metas: {
              select: {
                mid: true,
                name: true,
                slug: true,
                type: true,
              },
            },
          },
        },
      },
    });

    // 在应用层进行分组和处理
    const result = categories.map(category => {
      // 过滤出属于当前分类的文章
      const categoryPosts = allPosts.filter(post =>
        post.postrelations.some(r => r.mid === category.mid)
      ).slice(0, limit); // 每个分类只取指定数量

      // 处理文章数据
      const mappedPosts = categoryPosts.map(post => {
        // 只获取标签（不获取分类，因为已经在分类页面了）
        const tags = post.postrelations
          .filter(r => r.metas.type === "tag")
          .map(r => ({
            name: r.metas.name,
            slug: r.metas.slug,
          }));

        const covers = parseCovers(post.covers);

        return {
          cid: post.cid,
          title: post.title,
          slug: post.slug,
          desc: post.desc,
          covers,
          created: post.create_time,
          commentsNum: post.comment_num || 0,
          tags,
        };
      });

      return {
        category: {
          mid: category.mid,
          name: category.name,
          desc: category.desc,
          slug: category.slug,
        },
        posts: mappedPosts,
      };
    });

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
