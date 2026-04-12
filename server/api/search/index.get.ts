import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async event => {
  const query = getQuery(event);
  const keyword = query.q as string;

  if (!keyword || !keyword.trim()) {
    return {
      success: true,
      data: {
        results: [],
        total: 0,
      },
    };
  }

  try {
    // 搜索文章（type=0，已发布的）
    const posts = await prisma.post.findMany({
      where: {
        status: 1,
        type: 0,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { desc: { contains: keyword, mode: "insensitive" } },
          { content: { contains: keyword, mode: "insensitive" } },
        ],
      },
      include: {
        user: {
          select: {
            nickname: true,
            name: true,
          },
        },
        postrelation: {
          include: {
            category: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        create_time: "desc",
      },
      take: 20,
    });

    // 格式化结果
    const results = posts.map(post => {
      // 获取第一个分类
      const category = post.postrelation && post.postrelation.length > 0
        ? post.postrelation[0].metas
        : null;

      // 从内容中提取摘要（去掉 HTML 标签）
      let contentSnippet = "";
      if (post.content) {
        const plainText = post.content.replace(/<[^>]*>/g, "");
        const index = plainText.toLowerCase().indexOf(keyword.toLowerCase());
        if (index !== -1) {
          // 提取关键词周围的内容（前后各50字符）
          const start = Math.max(0, index - 50);
          const end = Math.min(plainText.length, index + keyword.length + 50);
          contentSnippet = (start > 0 ? "..." : "") + plainText.substring(start, end) + (end < plainText.length ? "..." : "");
        } else {
          // 如果没找到关键词，取前150个字符
          contentSnippet = plainText.substring(0, 150) + (plainText.length > 150 ? "..." : "");
        }
      }

      return {
        cid: post.cid,
        title: post.title,
        slug: post.slug,
        desc: post.desc,
        contentSnippet,
        categorySlug: category?.slug,
        categoryName: category?.name,
        createTime: post.create_time,
      };
    });

    return {
      success: true,
      data: {
        results,
        total: results.length,
      },
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: "搜索失败",
    });
  }
});
