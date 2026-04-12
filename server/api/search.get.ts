import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const q = (query.q as string || "").trim();

    if (!q) {
      return {
        code: 200,
        data: {
          results: [],
          total: 0,
        },
      };
    }

    // 搜索文章
    const posts = await prisma.post.findMany({
      where: {
        AND: [
          { status: 1 },
          { type: 0 },
          {
            OR: [
              { title: { contains: q } },
              { desc: { contains: q } },
              { content: { contains: q } },
            ],
          },
        ],
      },
      include: {
        postrelation: {
          include: {
            category: {
              select: {
                mid: true,
                name: true,
                slug: true,
              },
            },
          },
          take: 1,
        },
      },
      orderBy: {
        create_time: "desc",
      },
    });

    // 格式化结果
    const results = posts.map(post => {
      const category = post.postrelation?.[0]?.metas;
      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        createTime: post.create_time,
        categoryName: category?.name || null,
        categorySlug: category?.slug || null,
        // 生成内容摘要（截取前200个字符）
        contentSnippet: post.content ? post.content.substring(0, 200).replace(/<[^>]*>/g, "") : null,
      };
    });

    return {
      code: 200,
      message: "搜索成功",
      data: {
        results,
        total: results.length,
      },
    };
  } catch (error) {
    console.error("搜索失败:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "搜索失败",
    });
  }
});
