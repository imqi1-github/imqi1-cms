/**
 * MCP Server 工具集（只读）：把我方公开内容暴露给 AI Agent。
 *
 * 设计原则：
 *   - **只读**：暴露 search_content / get_content / list_* 工具，不暴露写工具；
 *     防止 prompt injection 把 AI 引导到删文章/改评论。
 *   - **公开字段白名单**：与公开 API 同口径，只下发展示用的列；
 *     ip / agent / uid / status / type 等内部字段不下发。
 *   - **限速**：每次 tool 调用由 server/routes/mcp.post.ts 端点级 Redis 限速（与通用中间件并行）。
 *   - **运维工具组**：get_system_status / get_recent_logs / get_content_stats / get_cache_info /
 *     clear_cache 五个运维工具，仅在运行环境配置了 MCP_OPS_TOKEN 时才注册（fail-closed），
 *     且每个工具入参必须携带 token（timingSafeEqual 定长比较）——日志/系统信息含 IP 等敏感
 *     数据，绝不能在未配令牌的公开端点上暴露。除 clear_cache（清缓存、自动重建、须 confirm:true，
 *     是全部工具里唯一非 readOnly 的）外，其余工具一律 readOnlyHint:true。
 */
import { timingSafeEqual } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";


import { prisma } from "./prisma";
import { markdownToPlainText } from "./markdownToPlainText";
import { redis } from "./redis";
import { dateKey, dayShardFiles, LOGS_DIR_RESOLVED, log } from "./log";
import { countKeysByPattern, invalidateContentCaches, scanAndUnlink } from "./content-cache";
import { detectDocker, getBuildHash } from "./runtime-info";

import { LOG_TAG_LABELS } from "#shared/constants";

/** 运维工具组开关：读进程环境（每请求判定，生产补配令牌无需重新构建） */
function opsEnabled(): boolean {
  return Boolean(process.env.MCP_OPS_TOKEN?.trim());
}

const BASE_INSTRUCTIONS = "只读检索 imqi1.com 个人博客的公开内容：搜索文章、读全文、列分类/标签/最新文章。";

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
      instructions: opsEnabled()
        ? `${BASE_INSTRUCTIONS} 另有运维诊断工具（get_system_status / get_recent_logs / get_content_stats / get_cache_info / clear_cache），调用须携带站主下发的运维令牌（token 入参）。`
        : BASE_INSTRUCTIONS,
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

  // —— 运维工具组：仅配置 MCP_OPS_TOKEN 时注册（fail-closed，与 mini-auth 同策略） ——
  if (opsEnabled()) {
    registerOpsTools(server);
  }

  return server;
}

// ==================== 运维工具组（MCP_OPS_TOKEN 门禁） ====================

/** 运维令牌校验：定长比较防时序侧信道（与 security-token 同策略） */
function verifyOpsToken(token: string): boolean {
  const expected = process.env.MCP_OPS_TOKEN?.trim() ?? "";
  if (!expected) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function opsText(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function opsError(code: string, extra: Record<string, unknown> = {}): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: code, ...extra }, null, 2) }], isError: true };
}

/** 运维工具统一兜底：DB/Redis 挂了要把错误带回给排障方，而不是炸掉 MCP 响应 */
async function opsGuard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (error) {
    return opsError("tool_failed", { message: error instanceof Error ? error.message.slice(0, 300) : String(error) });
  }
}

/** ops 工具入参共用的 token 字段 */
const opsTokenSchema = z.string().min(1).describe("运维令牌（MCP_OPS_TOKEN，向站主索取）");

/** 日志类别白名单 = LOG_TAG_LABELS 的键（与 log.ts 落盘子目录同名），同时防路径穿越 */
const LOG_CATEGORIES = Object.keys(LOG_TAG_LABELS);
const OPS_LOG_MAX_LINES = 200;
const OPS_LOG_MAX_CHARS = 256 * 1024;

/** get_cache_info 按前缀统计的键组（真实键前缀，冒号分隔；rl: 是 rate-limit 内部前缀） */
const CACHE_KEY_PREFIXES = ["nitro:routes:", "search:", "custom:", "error:notify:", "rl:mcp:post:"] as const;

function registerOpsTools(server: McpServer): void {
  // —— get_system_status：系统健康快照 ——
  server.registerTool(
    "get_system_status",
    {
      description: "【运维】系统健康快照：运行时长/内存、构建哈希、是否容器、数据库连通性与延迟、Redis 连通性与延迟。排查站点异常时先调这个。",
      inputSchema: z.object({ token: opsTokenSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ token }) => {
      return opsGuard(async () => {
        if (!verifyOpsToken(token)) return opsError("invalid_ops_token");

        let database: Record<string, unknown>;
        const dbStart = Date.now();
        try {
          const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version() AS version`;
          database = {
            ok: true,
            latencyMs: Date.now() - dbStart,
            version: String(rows[0]?.version ?? "").split(" ").slice(0, 2).join(" "),
          };
        } catch (error) {
          database = {
            ok: false,
            latencyMs: Date.now() - dbStart,
            error: error instanceof Error ? error.message.slice(0, 200) : String(error),
          };
        }

        let redisStatus: Record<string, unknown>;
        if (!redis) {
          redisStatus = { configured: false };
        } else {
          const pingStart = Date.now();
          try {
            await redis.ping();
            redisStatus = { configured: true, ok: true, status: redis.status, latencyMs: Date.now() - pingStart };
          } catch (error) {
            redisStatus = {
              configured: true,
              ok: false,
              status: redis.status,
              latencyMs: Date.now() - pingStart,
              error: error instanceof Error ? error.message.slice(0, 200) : String(error),
            };
          }
        }

        const mem = process.memoryUsage();
        return opsText({
          time: new Date().toISOString(),
          node: process.version,
          platform: `${process.platform}/${process.arch}`,
          inDocker: await detectDocker(),
          buildHash: getBuildHash() || "(开发版)",
          uptimeSec: Math.round(process.uptime()),
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
          database,
          redis: redisStatus,
        });
      });
    },
  );

  // —— get_recent_logs：读结构化日志尾部 ——
  server.registerTool(
    "get_recent_logs",
    {
      description: `【运维】读站点结构化日志（logs/<类别>/<日期>.log，含大小切分分片、自动合并全天）的末尾若干行，可按级别过滤。排查报错、限流命中、外部服务失败。类别：${LOG_CATEGORIES.join(" / ")}。`,
      inputSchema: z.object({
        token: opsTokenSchema,
        category: z.string().min(1).default("app").describe("日志类别（见工具描述里的列表）"),
        lines: z.number().int().min(1).max(OPS_LOG_MAX_LINES).default(50).describe("返回末尾行数"),
        level: z.enum(["all", "info", "warn", "error"]).default("all").describe("按级别过滤"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("日期 YYYY-MM-DD（默认今天，服务器时区）"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ token, category, lines, level, date }) => {
      return opsGuard(async () => {
        if (!verifyOpsToken(token)) return opsError("invalid_ops_token");
        if (!LOG_CATEGORIES.includes(category)) return opsError("unknown_category", { allowed: LOG_CATEGORIES });

        // category 过白名单、date 被正则限定，拼接不会穿越出 LOGS_DIR
        const day = date ?? dateKey();
        const dir = join(LOGS_DIR_RESOLVED, category);
        // 开启大小切分后一天可能有多个分片（{day}.log、{day}.1.log…），按序号升序合并
        let shards: string[];
        try {
          shards = dayShardFiles(day, await readdir(dir));
        } catch {
          shards = [];
        }
        if (shards.length === 0) {
          return opsText({ category, date: day, level, totalLines: 0, returnedLines: 0, lines: [], note: "该类别当日无日志文件" });
        }
        const all: string[] = [];
        for (const name of shards) {
          const text = await readFile(join(dir, name), "utf8");
          for (const l of text.split("\n")) {
            if (l.length > 0) all.push(l);
          }
        }

        const filtered = level === "all" ? all : all.filter(line => line.includes(`[${level.toUpperCase()}]`));
        // 每行截断 + 总量兜底：日志行可能含长堆栈/长 UA，防止一次调用撑爆模型上下文
        const picked = filtered.slice(-lines).map(line => (line.length > 4000 ? `${line.slice(0, 4000)}…[截断]` : line));
        while (picked.length > 1 && picked.reduce((n, line) => n + line.length, 0) > OPS_LOG_MAX_CHARS) {
          picked.shift();
        }
        return opsText({ category, date: day, level, shards, totalLines: filtered.length, returnedLines: picked.length, lines: picked });
      });
    },
  );

  // —— get_content_stats：内容数据概览 ——
  server.registerTool(
    "get_content_stats",
    {
      description: "【运维】内容数据概览：文章/评论按状态分布、已发布页面/友链/附件/订阅数、最近发布一篇、定时发布队列。排查「内容为什么没显示/没发出去」。",
      inputSchema: z.object({ token: opsTokenSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ token }) => {
      return opsGuard(async () => {
        if (!verifyOpsToken(token)) return opsError("invalid_ops_token");

        const [articleGroups, commentGroups, pagesPublished, enabledLinks, pendingLinkMods, attachmentCount, subscribeCount] =
          await Promise.all([
            prisma.contents.groupBy({ by: ["status"], where: { type: 0 }, _count: { _all: true } }),
            prisma.comments.groupBy({ by: ["status"], _count: { _all: true } }),
            prisma.contents.count({ where: { type: 1, status: 1 } }),
            prisma.links.count({ where: { enabled: true } }),
            prisma.links.count({ where: { isModification: true, modificationStatus: "pending" } }),
            prisma.attachments.count(),
            prisma.subscribes.count(),
          ]);
        const [latest, scheduled] = await Promise.all([
          prisma.contents.findFirst({
            where: { type: 0, status: 1 },
            select: { cid: true, title: true, create_time: true },
            orderBy: { create_time: "desc" },
          }),
          prisma.contents.findMany({
            where: { type: 0, status: 0, scheduled_at: { not: null } },
            select: { cid: true, title: true, scheduled_at: true },
            orderBy: { scheduled_at: "asc" },
            take: 10,
          }),
        ]);

        // 不枚举状态语义（历史数据可能出现其他值），按状态值原样给数，另附常见语义说明
        const byStatus = (groups: Array<{ status: number; _count: { _all: number } }>) =>
          Object.fromEntries(groups.map(g => [String(g.status), g._count._all]));

        return opsText({
          articlesByStatus: byStatus(Array.isArray(articleGroups) ? articleGroups : []),
          commentsByStatus: byStatus(Array.isArray(commentGroups) ? commentGroups : []),
          pagesPublished,
          links: { enabled: enabledLinks, pendingModifications: pendingLinkMods },
          attachments: attachmentCount,
          subscribes: subscribeCount,
          latestPublished: latest
            ? { cid: latest.cid, title: latest.title, publishedAt: latest.create_time.toISOString() }
            : null,
          scheduledPublishQueue: (scheduled ?? []).map(s => ({
            cid: s.cid,
            title: s.title,
            publishAt: s.scheduled_at?.toISOString() ?? null,
          })),
          statusNote: "状态值语义：1=已发布/已通过审核，0=草稿/待审核",
        });
      });
    },
  );

  // —— get_cache_info：Redis 缓存诊断 ——
  server.registerTool(
    "get_cache_info",
    {
      description: "【运维】Redis 缓存诊断：连通性与延迟、键总数、内存占用、按前缀统计键量（ISR 页面缓存/搜索/自定义/错误通知去重/MCP 限流）。排查「改了内容前台不刷新」。",
      inputSchema: z.object({ token: opsTokenSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ token }) => {
      return opsGuard(async () => {
        if (!verifyOpsToken(token)) return opsError("invalid_ops_token");
        if (!redis) return opsText({ configured: false, note: "未配置 Redis：整页缓存退文件系统、搜索缓存关闭" });

        const pingStart = Date.now();
        await redis.ping();
        const memory = await redis.info("memory");

        const keyCounts = Object.fromEntries(
          await Promise.all(
            CACHE_KEY_PREFIXES.map(async prefix => [prefix.replace(/:$/, ""), await countKeysByPattern(`${prefix}*`)] as const),
          ),
        );

        return opsText({
          configured: true,
          status: redis.status,
          pingLatencyMs: Date.now() - pingStart,
          dbSize: await redis.dbsize(),
          usedMemory: /used_memory_human:([^\r\n]+)/.exec(memory)?.[1]?.trim() ?? null,
          peakMemory: /used_memory_peak_human:([^\r\n]+)/.exec(memory)?.[1]?.trim() ?? null,
          keyCounts,
        });
      });
    },
  );

  // —— clear_cache：清缓存（全部工具里唯一非 readOnly；缓存自动重建，安全可逆） ——
  server.registerTool(
    "clear_cache",
    {
      description: "【运维】清 Redis 缓存（清后自动重建）。target=pages 清整组 ISR 页面缓存（改了内容前台不刷新时用）/ search 搜索缓存 / footprint 访客足迹缓存 / keyword 按键名子串。须 confirm:true。",
      inputSchema: z.object({
        token: opsTokenSchema,
        target: z.enum(["pages", "search", "footprint", "keyword"]).describe("清理目标"),
        keyword: z.string().min(1).optional().describe("target=keyword 时的键名子串"),
        confirm: z.boolean().describe("必须显式传 true 才执行"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ token, target, keyword, confirm }) => {
      return opsGuard(async () => {
        if (!verifyOpsToken(token)) return opsError("invalid_ops_token");
        if (confirm !== true) return opsError("need_confirm", { note: "clear_cache 会删缓存键，须显式 confirm:true" });
        if (!redis) return opsText({ target, cleared: 0, note: "未配置 Redis，无需清理" });

        let cleared: number;
        let note: string | undefined;
        if (target === "pages") {
          // 清整组页面缓存（pattern *nitro:routes*）；-1 = 全组不计数（与 admin 端语义一致）
          await invalidateContentCaches();
          cleared = -1;
          note = "已清整组 ISR 页面缓存（nitro:routes）";
        } else if (target === "search") {
          cleared = await scanAndUnlink("search:*");
        } else if (target === "footprint") {
          cleared = await scanAndUnlink("custom:footprint");
        } else {
          const safe = (keyword ?? "").replace(/[\\*?[\]]/g, "");
          if (!safe) return opsError("keyword_required", { note: "target=keyword 时须提供不含通配符的子串" });
          cleared = await scanAndUnlink(`*${safe}*`);
        }

        log.audit("MCP 清理缓存", { target, keyword: keyword ?? undefined, cleared });
        return opsText({ target, keyword: keyword ?? undefined, cleared, note });
      });
    },
  );
}
