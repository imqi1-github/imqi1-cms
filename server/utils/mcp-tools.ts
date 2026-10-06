/**
 * MCP Server 工具集（只读）：把我方公开内容暴露给 AI Agent。
 *
 * 设计原则：
 *   - **只读**：暴露 search_content / get_content / list_* 工具，不暴露写工具；
 *     防止 prompt injection 把 AI 引导到删文章/改评论。
 *   - **公开字段白名单**：与公开 API 同口径，只下发展示用的列；
 *     ip / agent / uid / status / type 等内部字段不下发。
 *   - **限速**：每次 tool 调用由 server/routes/mcp.post.ts 端点级 Redis 限速（与通用中间件并行）。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { prisma } from "./prisma";
import { markdownToPlainText } from "./markdownToPlainText";

/** MCP 服务端描述。Agent 通过 listTools 看 description 决定调不调。 */
export function createImqi1McpServer(): McpServer {
  const server = new McpServer(
    {
      name: "imqi1-cms",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: "只读检索 imqi1.com 个人博客的公开内容：搜索文章、读全文、列分类/标签/最新文章。",
    },
  );

  // —— search_content：按关键词搜已发布文章 ——
  server.registerTool(
    "search_content",
    {
      description: "搜索已发布的文章。返回匹配的标题、摘要、链接、发布时间；不含正文。",
      inputSchema: z.object({
        q: z.string().min(1).describe("搜索关键词（中英文均可）"),
        limit: z.number().int().min(1).max(20).default(10).describe("返回条数上限，1~20"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ q, limit }) => {
      const rows = await prisma.contents.findMany({
        where: {
          status: 1,
          type: 0,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { desc: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          cid: true,
          title: true,
          desc: true,
          slug: true,
          create_time: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });

      const items = rows.map(row => ({
        cid: row.cid,
        title: row.title,
        desc: row.desc ?? "",
        slug: row.slug,
        url: `/content/${row.contentrelations?.[0]?.metas?.slug ?? "uncategorized"}/${row.slug ?? row.cid}`,
        published_at: row.create_time.toISOString(),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ q, count: items.length, items }, null, 2),
          },
        ],
      };
    },
  );

  // —— get_content：取一篇文章的正文 ——
  server.registerTool(
    "get_content",
    {
      description: "取一篇文章的完整正文（Markdown 源码转纯文本）。",
      inputSchema: z.object({
        cid: z.number().int().positive().describe("文章 cid（数字 ID）"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cid }) => {
      const row = await prisma.contents.findFirst({
        where: { cid, status: 1, type: 0 },
        select: {
          cid: true,
          title: true,
          desc: true,
          slug: true,
          content: true,
          create_time: true,
          update_time: true,
          user: { select: { nickname: true, name: true } },
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
        },
      });

      if (!row) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "article_not_found", cid }) }],
          isError: true,
        };
      }

      const plain = markdownToPlainText(row.content ?? row.desc ?? "");
      const truncated = plain.length > 8192 ? `${plain.slice(0, 8192)}\n\n[截断，原文更长]` : plain;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                cid: row.cid,
                title: row.title,
                desc: row.desc ?? "",
                url: `/content/${row.contentrelations?.[0]?.metas?.slug ?? "uncategorized"}/${row.slug ?? row.cid}`,
                author: row.user?.nickname ?? row.user?.name ?? "admin",
                published_at: row.create_time.toISOString(),
                updated_at: row.update_time.toISOString(),
                plain_text: truncated,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // —— list_recent_contents：最新发布的文章 ——
  server.registerTool(
    "list_recent_contents",
    {
      description: "列出最近发布的文章标题、链接、发布时间。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const rows = await prisma.contents.findMany({
        where: { status: 1, type: 0 },
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          create_time: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });

      const items = rows.map(row => ({
        cid: row.cid,
        title: row.title,
        desc: row.desc ?? "",
        url: `/content/${row.contentrelations?.[0]?.metas?.slug ?? "uncategorized"}/${row.slug ?? row.cid}`,
        published_at: row.create_time.toISOString(),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_categories：分类列表 ——
  server.registerTool(
    "list_categories",
    {
      description: "列出所有文章分类（含每分类下的文章数）。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await prisma.metas.findMany({
        where: { type: "category" },
        select: {
          mid: true,
          name: true,
          slug: true,
          desc: true,
          _count: {
            select: {
              contentrelations: {
                where: { content: { type: 0, status: 1 } },
              },
            },
          },
        },
        orderBy: { mid: "asc" },
      });
      const items = rows.map(row => ({
        name: row.name,
        slug: row.slug,
        desc: row.desc ?? "",
        url: `/category/${row.slug}`,
        content_count: row._count.contentrelations,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_tags：标签列表 ——
  server.registerTool(
    "list_tags",
    {
      description: "列出所有标签（含每标签下的文章数）。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await prisma.metas.findMany({
        where: { type: "tag" },
        select: {
          name: true,
          slug: true,
          desc: true,
          _count: {
            select: {
              contentrelations: {
                where: { content: { type: 0, status: 1 } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
      const items = rows.map(row => ({
        name: row.name,
        slug: row.slug,
        desc: row.desc ?? "",
        url: `/tag/${row.slug}`,
        content_count: row._count.contentrelations,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_pages：独立页面列表 ——
  server.registerTool(
    "list_pages",
    {
      description: "列出已发布的独立页面（如留言板、协议、关于）。返回 slug、标题、描述与前台 URL。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const rows = await prisma.contents.findMany({
        where: { status: 1, type: 1 },
        select: { slug: true, title: true, desc: true, update_time: true },
        orderBy: { update_time: "desc" },
        take: limit,
      });
      const items = rows.map(row => ({
        slug: row.slug,
        title: row.title,
        desc: row.desc ?? "",
        url: row.slug === "messages" ? "/messages" : `/page/${row.slug}`,
        updated_at: row.update_time.toISOString(),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— get_random_content：随机文章 ——
  server.registerTool(
    "get_random_content",
    {
      description: "随机返回一篇已发布文章。可按分类 slug 限定范围。",
      inputSchema: z.object({
        categorySlug: z.string().min(1).optional()
          .describe("限定到某分类下的随机文章（slug 来自 list_categories）"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ categorySlug }) => {
      const where = { status: 1, type: 0 } as const;
      if (categorySlug) {
        const rows = await prisma.contents.findMany({
          where: {
            ...where,
            contentrelations: { some: { metas: { slug: categorySlug, type: "category" } } },
          },
          select: { cid: true },
        });
        if (rows.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "no_article_in_category", categorySlug }) }], isError: true };
        }
        const picked = rows[Math.floor(Math.random() * rows.length)]!;
        return { content: [{ type: "text", text: JSON.stringify({ cid: picked.cid, note: "用 get_content(cid) 取正文" }, null, 2) }] };
      }
      const total = await prisma.contents.count({ where });
      if (total === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "no_article" }) }], isError: true };
      }
      const skip = Math.floor(Math.random() * total);
      const [row] = await prisma.contents.findMany({
        where,
        skip,
        take: 1,
        select: { cid: true },
      });
      return { content: [{ type: "text", text: JSON.stringify({ cid: row!.cid, note: "用 get_content(cid) 取正文" }, null, 2) }] };
    },
  );

  // —— get_recent_comments：全站最新评论 ——
  server.registerTool(
    "get_recent_comments",
    {
      description: "取全站最新已审核评论，含文章标题与链接。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const rows = await prisma.comments.findMany({
        where: { status: 1 },
        select: {
          coid: true,
          content: true,
          name: true,
          create_time: true,
          content_ref: {
            select: {
              cid: true,
              title: true,
              slug: true,
              contentrelations: {
                where: { metas: { type: "category" } },
                orderBy: { mid: "asc" },
                take: 1,
                select: { metas: { select: { slug: true } } },
              },
            },
          },
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });
      const items = rows
        .filter(r => r.content_ref?.slug && r.content_ref.contentrelations.length > 0)
        .map(r => {
          const catSlug = r.content_ref!.contentrelations[0]?.metas?.slug ?? "";
          return {
            coid: r.coid,
            text: r.content,
            author: r.name,
            created_at: r.create_time.toISOString(),
            article: {
              cid: r.content_ref!.cid,
              title: r.content_ref!.title,
              url: `/content/${catSlug}/${r.content_ref!.slug}`,
            },
          };
        });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— get_comments：单篇文章评论 ——
  server.registerTool(
    "get_comments",
    {
      description: "取指定文章 cid 下已审核的评论列表，按时间倒序。",
      inputSchema: z.object({
        cid: z.number().int().positive().describe("文章 cid"),
        limit: z.number().int().min(1).max(100).default(20).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cid, limit }) => {
      const rows = await prisma.comments.findMany({
        where: { cid, status: 1 },
        select: {
          coid: true,
          content: true,
          name: true,
          mail: true,
          create_time: true,
          parent_id: true,
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });
      const items = rows.map(r => ({
        coid: r.coid,
        parent_coid: r.parent_id,
        text: r.content,
        author: r.name,
        created_at: r.create_time.toISOString(),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ cid, count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_friend_links：友链 ——
  server.registerTool(
    "list_friend_links",
    {
      description: "列出已启用且已审核的友情链接。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await prisma.links.findMany({
        where: {
          enabled: true,
          OR: [{ isModification: false }, { isModification: true, modificationStatus: "approved" }],
        },
        select: { name: true, desc: true, link: true, avatar: true },
        orderBy: { id: "asc" },
      });
      const items = rows.map(r => ({
        name: r.name,
        desc: r.desc ?? "",
        url: r.link,
        avatar: r.avatar,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_changelogs：公开更新日志 ——
  server.registerTool(
    "list_changelogs",
    {
      description: "取公开更新日志（已按类型分组的渲染 HTML）。",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const rows = await prisma.changelogs.findMany({
        select: { id: true, content: true, create_time: true },
        orderBy: { create_time: "desc" },
        take: limit,
      });
      const items = rows.map(r => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(r.content);
        } catch {
          parsed = [];
        }
        return {
          id: r.id,
          create_time: r.create_time.toISOString(),
          entries: parsed,
        };
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— get_related_contents：相关文章 ——
  server.registerTool(
    "get_related_contents",
    {
      description: "取指定文章 cid 的相关文章（按共享标签数排序）。返回标题、链接、发布时间，不含正文。",
      inputSchema: z.object({
        cid: z.number().int().positive().describe("文章 cid"),
        limit: z.number().int().min(1).max(20).default(5).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ cid, limit }) => {
      const me = await prisma.contents.findUnique({
        where: { cid },
        select: {
          contentrelations: {
            where: { metas: { type: "tag" } },
            select: { mid: true },
          },
        },
      });
      if (!me) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "article_not_found", cid }) }], isError: true };
      }
      const tagMids = me.contentrelations.map(r => r.mid);
      if (tagMids.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ cid, count: 0, items: [] }, null, 2) }] };
      }
      const cands = await prisma.contents.findMany({
        where: {
          status: 1, type: 0, cid: { not: cid },
          contentrelations: { some: { mid: { in: tagMids }, metas: { type: "tag" } } },
        },
        select: {
          cid: true,
          title: true,
          slug: true,
          create_time: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
          _count: {
            select: {
              contentrelations: {
                where: { mid: { in: tagMids }, metas: { type: "tag" } },
              },
            },
          },
        },
        take: limit * 4,
      });
      const items = cands
        .sort((a, b) => b._count.contentrelations - a._count.contentrelations)
        .slice(0, limit)
        .map(c => ({
          cid: c.cid,
          title: c.title,
          url: `/content/${c.contentrelations[0]?.metas?.slug ?? "uncategorized"}/${c.slug ?? c.cid}`,
          published_at: c.create_time.toISOString(),
          shared_tags: c._count.contentrelations,
        }));
      return {
        content: [{ type: "text", text: JSON.stringify({ cid, count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_category_articles：分类下文章 ——
  server.registerTool(
    "list_category_articles",
    {
      description: "取指定分类 slug 下的文章列表，按发布时间倒序。",
      inputSchema: z.object({
        slug: z.string().min(1).describe("分类 slug"),
        limit: z.number().int().min(1).max(50).default(20).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, limit }) => {
      const rows = await prisma.contents.findMany({
        where: {
          status: 1, type: 0,
          contentrelations: { some: { metas: { slug, type: "category" } } },
        },
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          create_time: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });
      const items = rows.map(r => ({
        cid: r.cid,
        title: r.title,
        desc: r.desc ?? "",
        url: `/content/${r.contentrelations[0]?.metas?.slug ?? "uncategorized"}/${r.slug ?? r.cid}`,
        published_at: r.create_time.toISOString(),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ slug, count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— list_tag_articles：标签下文章 ——
  server.registerTool(
    "list_tag_articles",
    {
      description: "取指定标签 slug 下的文章列表，按发布时间倒序。",
      inputSchema: z.object({
        slug: z.string().min(1).describe("标签 slug"),
        limit: z.number().int().min(1).max(50).default(20).describe("返回条数上限"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug, limit }) => {
      const rows = await prisma.contents.findMany({
        where: {
          status: 1, type: 0,
          contentrelations: { some: { metas: { slug, type: "tag" } } },
        },
        select: {
          cid: true,
          title: true,
          slug: true,
          desc: true,
          create_time: true,
          contentrelations: {
            where: { metas: { type: "category" } },
            orderBy: { mid: "asc" },
            take: 1,
            select: { metas: { select: { slug: true } } },
          },
        },
        orderBy: { create_time: "desc" },
        take: limit,
      });
      const items = rows.map(r => ({
        cid: r.cid,
        title: r.title,
        desc: r.desc ?? "",
        url: `/content/${r.contentrelations[0]?.metas?.slug ?? "uncategorized"}/${r.slug ?? r.cid}`,
        published_at: r.create_time.toISOString(),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ slug, count: items.length, items }, null, 2) }],
      };
    },
  );

  // —— get_site_info：站点基本信息 ——
  server.registerTool(
    "get_site_info",
    {
      description: "取站点名、描述、URL 等基本信息，用于自我介绍或引用。",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const rows = await prisma.informations.findMany({
        where: { key: { in: ["siteName", "siteUrl", "siteDescription", "siteBeian"] } },
        select: { key: true, value: true },
      });
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: map.siteName ?? "",
            url: map.siteUrl ?? "",
            description: map.siteDescription ?? "",
            beian: map.siteBeian ?? "",
          }, null, 2),
        }],
      };
    },
  );

  return server;
}