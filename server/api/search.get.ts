import { prisma } from "#server/utils/prisma";

// 搜索关键词净化
function sanitizeSearchKeyword(keyword: string): string {
  // 1. 移除前后空格
  let sanitized = keyword.trim();

  // 2. 限制长度（防止超长字符串攻击）
  const MAX_KEYWORD_LENGTH = 100;
  if (sanitized.length > MAX_KEYWORD_LENGTH) {
    sanitized = sanitized.substring(0, MAX_KEYWORD_LENGTH);
  }

  // 3. 移除危险的 SQL/NoSQL 特殊字符（保留中文、英文、数字、常用符号）
  // 允许：中文、字母、数字、空格、常用标点
  sanitized = sanitized.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\-_.,!?@#%&*()]/g, "");

  // 4. 防止多个连续空格
  sanitized = sanitized.replace(/\s+/g, " ");

  return sanitized;
}

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const rawKeyword = query.q as string || "";
    const q = sanitizeSearchKeyword(rawKeyword);

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
