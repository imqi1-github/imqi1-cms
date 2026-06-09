import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 6;

    // 设置缓存头：CDN和浏览器缓存5分钟
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 获取图片分类设置
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

    const posts = await prisma.posts.findMany({
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
      take: limit,
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

    const data = posts.map(post => {
      // 分离分类和标签
      const categories = post.postrelations
        .filter(r => r.metas.type === "category")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
        }));

      const tags = post.postrelations
        .filter(r => r.metas.type === "tag")
        .map(r => ({
          name: r.metas.name,
          slug: r.metas.slug,
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
        commentsNum: post.comment_num || 0,
        categories,
        tags,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("获取最新文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
