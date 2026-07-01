import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async () => {
  try {
    const travels = await prisma.travels.findMany({
      where: { enabled: true },
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      include: {
        // posts 现在是 posttravels[] 关联表，需通过 .post 取到文章
        posts: {
          select: {
            post: {
              select: {
                cid: true,
                title: true,
                slug: true,
                type: true,
                covers: true,
                many_covers: true,
                postrelations: {
                  select: {
                    metas: { select: { slug: true, type: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // 展平为前台结构：每个地点附带其全部关联文章（url/标题/封面数）
    const data = travels.map(t => {
      const posts = t.posts.flatMap(rel => {
        const post = rel.post;
        const categorySlug = post.postrelations.find(r => r.metas.type === "category")?.metas.slug;
        if (!categorySlug || !post.slug) return [];
        const covers = parseCovers(post.covers);
        const coverCount = covers.length;
        const manyCovers = Boolean(post.many_covers) && covers.length > 1;
        return [{
          url: `/content/${categorySlug}/${post.slug}`,
          title: post.title,
          coverCount,
          manyCovers,
        }];
      });
      return {
        id: t.id,
        name: t.name,
        desc: t.desc,
        cover: t.cover,
        longitude: t.longitude,
        latitude: t.latitude,
        sort: t.sort,
        posts,
      };
    });

    return {
      code: 200,
      message: "获取旅行地点成功",
      data,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取旅行地点失败",
    });
  }
});
