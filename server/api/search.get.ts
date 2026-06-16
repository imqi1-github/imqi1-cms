import { prisma } from "#server/utils/prisma";
import { redis } from "#server/utils/redis";
import { escapeHtml, escapeRegExp } from "~~/lib/html";

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

// 获取搜索设置
async function getSearchSettings() {
  try {
    const settings = await prisma.informations.findMany({
      where: {
        key: {
          in: ["searchCacheEnabled", "searchCacheExpire"],
        },
      },
    });

    const settingsMap = settings.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      cacheEnabled: settingsMap["searchCacheEnabled"] === "true",
      cacheExpire: Number(settingsMap["searchCacheExpire"]) || 300,
    };
  } catch (error) {
    // 如果获取设置失败，返回默认值（禁用缓存）
    return {
      cacheEnabled: false,
      cacheExpire: 300,
    };
  }
}

// 提取关键词上下文并高亮
function highlightKeyword(text: string, keyword: string, maxLength: number = 200): string {
  if (!text) return "";

  const index = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (index === -1) {
    // 如果没找到，返回前200个字符
    return escapeHtml(text.substring(0, maxLength));
  }

  // 提取关键词周围的上下文（前后各100个字符）
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + keyword.length + 100);

  let snippet = escapeHtml(text.substring(start, end));

  // 高亮关键词（使用 <mark> 标签）
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
  snippet = snippet.replace(regex, "<mark>$1</mark>");

  // 添加省略号
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

// 清理HTML标签（用于提取纯文本）
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "");
}

// 格式化搜索结果
async function formatSearchResults(posts: any[], query: string) {
  // 获取所有文章的 cid
  const cids = posts.map((p: any) => p.cid);

  // 批量获取分类信息
  const categories = await prisma.postrelations.findMany({
    where: {
      cid: { in: cids },
      metas: { type: "category" },
    },
    select: {
      cid: true,
      metas: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    take: 1,
  });

  // 创建 cid -> category 的映射
  const categoryMap = new Map();
  categories.forEach((rel) => {
    if (!categoryMap.has(rel.cid)) {
      categoryMap.set(rel.cid, rel.metas);
    }
  });

  // 格式化结果
  return posts.map((post: any) => {
    const category = categoryMap.get(post.cid);

    // 提取正文纯文本
    const plainContent = stripHtml(post.content || "");

    // 生成高亮摘要（优先显示包含关键词的部分）
    const highlightedSnippet = highlightKeyword(plainContent, query, 200);

    return {
      cid: post.cid,
      title: post.title,
      slug: post.slug,
      desc: post.desc,
      createTime: post.create_time,
      categoryName: category?.name || null,
      categorySlug: category?.slug || null,
      // 添加高亮摘要
      highlight: highlightedSnippet,
    };
  });
}

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event);
    const rawKeyword = (query.q as string) || "";
    const q = sanitizeSearchKeyword(rawKeyword);

    if (!q) {
      return {
        code: 200,
        message: "搜索成功",
        data: {
          results: [],
          total: 0,
          query: "",
        },
      };
    }

    // 获取搜索设置
    const searchSettings = await getSearchSettings();

    // ========== Redis 缓存逻辑 ==========
    if (searchSettings.cacheEnabled && redis) {
      const cacheKey = `search:${q}:all`;

      try {
        // 尝试从缓存获取
        const cached = await redis.get(cacheKey);
        if (cached) {
          console.log(`[搜索缓存命中] 关键词: "${q}"`);
          return {
            code: 200,
            message: "搜索成功（来自缓存）",
            data: JSON.parse(cached),
          };
        }
      } catch (error) {
        console.error("[搜索缓存读取失败]:", error);
        // 缓存失败时继续执行数据库查询
      }
    }

    // ========== 数据库搜索（LIKE 搜索，获取所有结果）==========
    const posts = await prisma.posts.findMany({
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
      select: {
        cid: true,
        title: true,
        slug: true,
        desc: true,
        content: true,
        create_time: true,
      },
      orderBy: { create_time: "desc" },
    });

    const total = posts.length;
    console.log(`[LIKE 搜索] 关键词: "${q}", 找到 ${total} 条结果`);

    // 格式化结果（传入搜索关键词用于高亮）
    const results = await formatSearchResults(posts, q);

    const responseData = {
      results,
      total,
      query: q,
    };

    // ========== 缓存搜索结果 ==========
    if (searchSettings.cacheEnabled && redis && results.length > 0) {
      try {
        const cacheKey = `search:${q}:all`;
        await redis.setex(
          cacheKey,
          searchSettings.cacheExpire,
          JSON.stringify(responseData)
        );
        console.log(`[搜索缓存已保存] 关键词: "${q}", 过期时间: ${searchSettings.cacheExpire}秒`);
      } catch (error) {
        console.error("[搜索缓存保存失败]:", error);
      }
    }

    return {
      code: 200,
      message: "搜索成功",
      data: responseData,
    };
  } catch (error) {
    console.error("[搜索失败]:", error);
    throw createError({
      statusCode: 500,
      statusMessage: "搜索失败",
    });
  }
});
