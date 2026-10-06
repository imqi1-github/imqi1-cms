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

  return server;
}