import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const limit = Number(query.limit) || 4;

    // 设置缓存头：CDN和浏览器缓存10分钟
    setHeader(event, "Cache-Control", "public, max-age=600, s-maxage=600");

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

    if (!photoCategory) {
      return {
        success: false,
        data: [],
      };
    }

    const posts = await prisma.posts.findMany({
      where: {
        type: 0, // 0: 文章
        status: 1,
        postrelations: {
          some: {
            mid: photoCategory.mid,
          },
        },
      },
      take: limit,
      orderBy: {
        create_time: "desc",
      },
      include: {
        postrelations: {
          select: {
            cid: true,
            mid: true,
            metas: {
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

    const data = posts.map(post => {
      const categories = post.postrelations.map(r => ({
        name: r.metas.name,
        slug: r.metas.slug,
      }));

      const covers = parseCovers(post.covers);

      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        covers,
        created: post.create_time,
        categories,
      };
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error("获取图片文章失败:", error);
    return {
      success: false,
      data: [],
    };
  }
});
