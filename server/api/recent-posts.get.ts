import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 6;

    // 获取图片分类设置
    const photoCategoryMeta = await prisma.information.findUnique({
      where: { key: "photoCategorySlug" },
    });
    const photoCategorySlug = photoCategoryMeta?.value || "shot";

    // 获取图片分类的 mid
    const photoCategory = await prisma.meta.findFirst({
      where: { slug: photoCategorySlug },
      select: { mid: true },
    });
    const photoCategoryMid = photoCategory?.mid;

    const posts = await prisma.post.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
        ...(photoCategoryMid && {
          postrelation: {
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
        postrelation: {
          select: {
            cid: true,
            mid: true,
            meta: {
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
      const categories = post.postrelation
        .filter(r => r.meta.type === "category")
        .map(r => ({
          name: r.meta.name,
          slug: r.meta.slug,
        }));

      const tags = post.postrelation
        .filter(r => r.meta.type === "tag")
        .map(r => ({
          name: r.meta.name,
          slug: r.meta.slug,
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
