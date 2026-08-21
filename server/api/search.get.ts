import { prisma } from "#server/utils/prisma";
import { redis } from "#server/utils/redis";
import { getCommentAvatarService, commentAvatarUrl } from "#server/utils/comment-avatar";
import { SearchQuerySchema, SearchResponseSchema } from "#server/utils/schemas";
import { sanitizeExternalUrl } from "#server/utils/rss";
import { defineTypedApiHandler } from "#server/types/typedApi";
import { escapeHtml, escapeRegExp } from "~~/lib/html";
import type { SearchContentItem } from "#server/types/apis/serach";

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
  sanitized = sanitized.replace(/[^一-龥a-zA-Z0-9\s\-_.,!?@#%&*()]/g, "");

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

    const settingsMap = settings.reduce(
      (acc, item) => {
        acc[item.key] = item.value;
        return acc;
      },
      {} as Record<string, string>,
    );

    return {
      cacheEnabled: settingsMap["searchCacheEnabled"] === "true",
      cacheExpire: Number(settingsMap["searchCacheExpire"]) || 300,
    };
  } catch (error) {
    console.error(error);
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

// ============ 各类型搜索结果结构 ============

// 文章搜索结果项
interface ContentSearchResult {
  type: "content";
  cid: number;
  title: string;
  slug: string | null;
  desc: string | null;
  createTime: Date;
  categoryName: string | null;
  categorySlug: string | null;
  // 正文高亮摘要
  highlight: string;
}

// 订阅源 / 友链搜索结果项（kind 区分来源）
interface SubscribeSearchResult {
  type: "subscribe";
  kind: "subscribe" | "link";
  id: number;
  name: string;
  url: string;
  desc: string | null;
  avatar: string | null;
}

// 评论搜索结果项（白名单字段，附文章上下文）
interface CommentSearchResult {
  type: "comment";
  coid: number;
  name: string;
  content: string;
  avatar: string;
  createTime: Date;
  articleTitle: string | null;
  articleUrl: string | null;
}

// 订阅文章搜索结果项（RSS 订阅抓取的文章）
interface SubscribePostSearchResult {
  type: "subscribepost";
  id: number;
  subscribeId: number;
  subscribeName: string;
  subscribeAvatar: string | null;
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  pubDate: Date | null;
}

type SearchBranchResult = {
  results: (ContentSearchResult | SubscribeSearchResult | CommentSearchResult | SubscribePostSearchResult)[];
  total: number;
};

// 格式化文章搜索结果（分类信息已通过 contentrelations 关联查询获取）
function formatSearchResults(contents: SearchContentItem[], query: string): ContentSearchResult[] {
  return contents.map(content => {
    const category = content.contentrelations?.[0]?.metas;

    // 提取正文纯文本
    const plainContent = stripHtml(content.content || "");

    // 生成高亮摘要（优先显示包含关键词的部分）
    const highlightedSnippet = highlightKeyword(plainContent, query, 200);

    return {
      type: "content",
      cid: content.cid,
      title: content.title,
      slug: content.slug,
      desc: content.desc,
      createTime: content.create_time,
      categoryName: category?.name || null,
      categorySlug: category?.slug || null,
      // 添加高亮摘要
      highlight: highlightedSnippet,
    };
  });
}

// 搜索文章（标题/描述/正文）
async function searchContents(q: string): Promise<SearchBranchResult> {
  const contents = await prisma.contents.findMany({
    where: {
      AND: [
        { status: 1 },
        { type: 0 },
        {
          OR: [{ title: { contains: q } }, { desc: { contains: q } }, { content: { contains: q } }],
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
      contentrelations: {
        where: {
          metas: { type: "category" },
        },
        select: {
          metas: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: { create_time: "desc" },
  });

  return { results: formatSearchResults(contents, q), total: contents.length };
}

// 搜索订阅源 + 友链（合并为同一类结果，kind 区分来源）
async function searchSubscribes(q: string): Promise<SearchBranchResult> {
  const [subscribes, links] = await Promise.all([
    // 订阅源：按名称 / Feed 地址匹配
    prisma.subscribes.findMany({
      where: {
        OR: [{ name: { contains: q } }, { url: { contains: q } }],
      },
      select: {
        id: true,
        name: true,
        url: true,
        avatar: true,
      },
      take: 50,
    }),
    // 友链：仅已启用且通过审核的（同 links.get.ts 的过滤规则），按名称/链接/描述匹配
    prisma.links.findMany({
      where: {
        enabled: true,
        AND: [
          {
            OR: [{ isModification: false }, { isModification: true, modificationStatus: "approved" }],
          },
          {
            OR: [{ name: { contains: q } }, { link: { contains: q } }, { desc: { contains: q } }],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        link: true,
        desc: true,
        avatar: true,
      },
      take: 50,
    }),
  ]);

  const results: SubscribeSearchResult[] = [
    ...subscribes.map(s => ({
      type: "subscribe" as const,
      kind: "subscribe" as const,
      id: s.id,
      name: s.name,
      url: s.url,
      desc: null,
      avatar: s.avatar,
    })),
    ...links.map(l => ({
      type: "subscribe" as const,
      kind: "link" as const,
      id: l.id,
      name: l.name,
      url: l.link,
      desc: l.desc,
      avatar: l.avatar,
    })),
  ];

  // 按名称排序，保证结果稳定（友链/订阅混排）
  results.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  return { results, total: results.length };
}

// 解析留言板文章 cid：留言板是独立 /messages 路由，其评论在链接拼装时单独放行（同 recent-comments）
async function resolveGuestbookCid(): Promise<number | null> {
  const messageContentIdMeta = await prisma.informations.findUnique({
    where: { key: "messageContentId" },
  });
  let guestbookCid = messageContentIdMeta?.value ? parseInt(messageContentIdMeta.value) : null;
  if (!guestbookCid) {
    const messageContent = await prisma.contents.findFirst({
      where: { slug: "messages" },
      select: { cid: true },
    });
    guestbookCid = messageContent?.cid ?? null;
  }
  return guestbookCid;
}

// 搜索评论（仅已审核，按评论内容/昵称匹配，附文章上下文）
async function searchComments(q: string): Promise<SearchBranchResult> {
  const guestbookCid = await resolveGuestbookCid();

  // 头像源与评论区共用同一份设置与服务端拼装逻辑（见 server/utils/comment-avatar）
  const avatarService = await getCommentAvatarService();

  const comments = await prisma.comments.findMany({
    where: {
      status: 1, // 已审核
      AND: [
        {
          // 只搜前台可见的评论：留言板评论放行（/messages 系统路由始终可访问），
          // 其余仅保留已发布文章（status:1）上的评论——否则草稿文章上的评论会出现在
          // 结果里却拼不出有效链接（且该文章前台本就不可见）
          OR: [
            ...(guestbookCid ? [{ cid: guestbookCid }] : []),
            { content_ref: { status: 1 } },
          ],
        },
        {
          OR: [{ content: { contains: q } }, { name: { contains: q } }],
        },
      ],
    },
    select: {
      coid: true,
      name: true,
      mail: true, // 仅服务端用于算头像，不下发
      content: true,
      create_time: true,
      content_ref: {
        select: {
          cid: true,
          title: true,
          slug: true,
          status: true, // 仅保留已发布文章（status:1），避免评论链接到下架/草稿文章而 404
          // 只取分类关系：一篇文章同时有分类和标签关系，不加 type 过滤时 take:1 可能抓到标签，
          // 导致拼出 /content/<标签slug>/<文章slug> 而 404
          contentrelations: {
            where: {
              metas: { type: "category" },
            },
            select: {
              metas: {
                select: {
                  slug: true,
                },
              },
            },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      create_time: "desc",
    },
    take: 50,
  });

  const results: CommentSearchResult[] = comments.map(comment => {
    const ref = comment.content_ref;
    let articleUrl: string | null = null;

    if (ref) {
      // 留言板评论：cid 命中留言板文章即放行——/messages 是系统路由始终可访问，不要求分类关系
      if (guestbookCid && ref.cid === guestbookCid) {
        articleUrl = `/messages#comment-${comment.coid}`;
      }
      // 文章评论：仅已发布文章，且需能拼出有效详情页链接
      // - 有分类：/content/<分类slug>/<文章slug>
      // - 无任何分类：兜底 /content/uncategorized/<文章slug>（同 search.vue 的 resolveLink 规则）
      // - 有分类但分类 slug 缺失：无法拼出有效链接，保持 null（前台同样不可达）
      else if (ref.status === 1 && ref.slug) {
        const categorySlug = ref.contentrelations[0]?.metas?.slug;
        if (categorySlug) {
          articleUrl = `/content/${categorySlug}/${ref.slug}#comment-${comment.coid}`;
        } else if (ref.contentrelations.length === 0) {
          articleUrl = `/content/uncategorized/${ref.slug}#comment-${comment.coid}`;
        }
      }
    }

    // 白名单字段：mail/ip/agent/status/link 等隐私与内部字段不下发
    return {
      type: "comment" as const,
      coid: comment.coid,
      name: comment.name,
      content: comment.content,
      avatar: commentAvatarUrl(comment.mail, avatarService),
      createTime: comment.create_time,
      articleTitle: ref?.title ?? null,
      articleUrl,
    };
  });

  return { results, total: results.length };
}

// 搜索订阅文章（RSS 订阅抓取的文章：标题/摘要/正文/作者）
async function searchSubscribeposts(q: string): Promise<SearchBranchResult> {
  const posts = await prisma.subscribeposts.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { content: { contains: q } },
        { author: { contains: q } },
      ],
    },
    select: {
      id: true,
      subscribeId: true,
      title: true,
      link: true,
      description: true,
      author: true,
      pubDate: true,
      subscribe: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
    orderBy: {
      pubDate: "desc",
    },
    take: 50,
  });

  const results: SubscribePostSearchResult[] = posts.map(post => ({
    type: "subscribepost",
    id: post.id,
    subscribeId: post.subscribeId,
    subscribeName: post.subscribe.name,
    subscribeAvatar: post.subscribe.avatar,
    title: post.title,
    // 仅 http/https 外链，防 RSS 投毒的 javascript:/data: 链接在点击时执行
    link: sanitizeExternalUrl(post.link),
    description: post.description,
    author: post.author,
    pubDate: post.pubDate,
  }));

  return { results, total: results.length };
}

export default defineTypedApiHandler(
  {
    query: SearchQuerySchema,
    response: SearchResponseSchema,
    description: "搜索接口（文章/订阅和友链/评论/订阅文章）",
  },
  async (event, { query }) => {
    try {
      const q = sanitizeSearchKeyword(query.q);
      const type = query.type;

      if (!q) {
        return {
          code: 200,
          message: "搜索成功",
          data: {
            results: [],
            total: 0,
            query: "",
            type,
          },
        };
      }

      // 获取搜索设置
      const searchSettings = await getSearchSettings();

      // ========== Redis 缓存逻辑 ==========
      if (searchSettings.cacheEnabled && redis) {
        const cacheKey = `search:${q}:${type}`;

        try {
          // 尝试从缓存获取
          const cached = await redis.get(cacheKey);
          if (cached) {
            console.log(`[搜索缓存命中] 关键词: "${q}", 类型: ${type}`);
            return {
              code: 200,
              message: "搜索成功（来自缓存）",
              data: JSON.parse(cached) as typeof responseData,
            };
          }
        } catch (error) {
          console.error(error);
          // 缓存失败时继续执行数据库查询
        }
      }

      // ========== 数据库搜索（按类型分支）==========
      let searchResult: SearchBranchResult;
      if (type === "subscribe") {
        searchResult = await searchSubscribes(q);
      } else if (type === "comment") {
        searchResult = await searchComments(q);
      } else if (type === "subscribepost") {
        searchResult = await searchSubscribeposts(q);
      } else {
        searchResult = await searchContents(q);
      }

      const { results, total } = searchResult;
      console.log(`[搜索] 关键词: "${q}", 类型: ${type}, 找到 ${total} 条结果`);

      const responseData = {
        results,
        total,
        query: q,
        type,
      };

      // ========== 缓存搜索结果 ==========
      if (searchSettings.cacheEnabled && redis && results.length > 0) {
        try {
          const cacheKey = `search:${q}:${type}`;
          await redis.setex(cacheKey, searchSettings.cacheExpire, JSON.stringify(responseData));
          console.log(`[搜索缓存已保存] 关键词: "${q}", 类型: ${type}, 过期时间: ${searchSettings.cacheExpire}秒`);
        } catch (error) {
          console.error(error);
        }
      }

      return {
        code: 200,
        message: "搜索成功",
        data: responseData,
      };
    } catch (error) {
      console.error(error);
      throw createError({
        statusCode: 500,
        statusMessage: "搜索失败",
      });
    }
  },
);
