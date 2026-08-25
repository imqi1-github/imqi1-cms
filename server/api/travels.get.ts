import { prisma } from "#server/utils/prisma";
import { parseCovers } from "#server/utils/covers";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");
  try {
    const travels = await prisma.travels.findMany({
      where: { enabled: true },
      orderBy: [{ sort: "asc" }, { create_time: "desc" }],
      // 公开接口：仅取消费方用到的列，杜绝整行摊开泄漏内部/冗余字段
      select: {
        id: true,
        name: true,
        desc: true,
        cover: true,
        longitude: true,
        latitude: true,
        sort: true,
        // contenttravels 关联表，需通过 .content 取到文章
        contenttravels: {
          select: {
            content: {
              select: {
                cid: true,
                title: true,
                slug: true,
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
    // 校验/查询抛出的 400、404 原样传递；findMany 不抛 P2025，但保留映射以防后续改动引入 OrThrow；
    // 未知服务端故障记日志 + 通用 500，绝不把 error.message 透传给客户端。
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      throw createError({ statusCode: 404, message: "旅行地点不存在" });
    }
    console.error(error);
    throw createError({
      statusCode: 500,
      message: "获取旅行地点失败",
    });
  }
});
