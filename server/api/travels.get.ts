import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");
  try {
    const travels = await prisma.travels.findMany({
      where: { enabled: true },
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      include: {
        // contenttravels 关联表，需通过 .content 取到文章
        contenttravels: {
          select: {
            content: {
              select: {
                cid: true,
                title: true,
                slug: true,
                type: true,
                covers: true,
                many_covers: true,
                contentrelations: {
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
      const contents = t.contenttravels.flatMap(rel => {
        const content = rel.content;
        const categorySlug = content.contentrelations.find(r => r.metas.type === "category")?.metas.slug;
        if (!categorySlug || !content.slug) return [];
        const covers = parseCovers(content.covers);
        const coverCount = covers.length;
        const manyCovers = Boolean(content.many_covers) && covers.length > 1;
        return [{
          url: `/content/${categorySlug}/${content.slug}`,
          title: content.title,
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
        contents,
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
