/**
 * MCP 工具集单元测试。
 *
 * 测试目标：createImqi1McpServer 注册的工具集合（名字、只读标注、入参 schema、回调行为）。
 * 策略：mock @modelcontextprotocol/server 拦截 registerTool 调用，拿到每个工具的回调直接驱动。
 * 这样不用走 SDK 内部 JSON-RPC 协议，能在毫秒级验完 15 个工具的契约。
 */
import "#test/helpers/nitro-globals";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface CapturedTool {
  name: string;
  description: string;
  inputSchema: { parse: (input: unknown) => unknown };
  annotations?: { readOnlyHint?: boolean };
  callback: (args: unknown) => Promise<unknown>;
}

const capturedTools: CapturedTool[] = [];

mock.module("@modelcontextprotocol/server", () => {
  class FakeMcpServer {
    server = {};
    constructor(_info: unknown, _opts: unknown) {}
    registerTool(name: string, config: {
      description?: string;
      inputSchema?: { parse?: (input: unknown) => unknown };
      annotations?: { readOnlyHint?: boolean };
    }, cb: (args: unknown) => Promise<unknown>) {
      capturedTools.push({
        name,
        description: config.description ?? "",
        inputSchema: { parse: config.inputSchema?.parse ?? ((x: unknown) => x) },
        annotations: config.annotations,
        callback: cb,
      });
      return {} as never;
    }
  }
  return {
    McpServer: FakeMcpServer,
    legacyStatelessFallback: () => () => new Response(),
  };
});

const { createImqi1McpServer } = await import("#server/utils/mcp-tools");

const EXPECTED_TOOLS = [
  "search_content",
  "get_content",
  "list_recent_contents",
  "list_categories",
  "list_tags",
  "list_pages",
  "get_random_content",
  "get_recent_comments",
  "get_comments",
  "list_friend_links",
  "list_changelogs",
  "get_related_contents",
  "list_category_articles",
  "list_tag_articles",
  "get_site_info",
];

beforeEach(() => {
  capturedTools.length = 0;
  createImqi1McpServer();
});

afterEach(() => {
  // 显式清空 sharedFake 注册的 handler，避免跨测试污染
  for (const key of [...(sharedFake as unknown as { state?: Map<string, unknown> }).state?.keys() ?? []]) {
    if (typeof key === "string") sharedFake.on(key, () => null as never);
  }
});

describe("createImqi1McpServer 注册契约", () => {
  test("注册的 15 个工具,名字齐全且唯一", () => {
    const names = capturedTools.map(t => t.name);
    expect(names.length).toBe(EXPECTED_TOOLS.length);
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  test("所有工具都标记 readOnlyHint(防 prompt injection 引导到写操作)", () => {
    for (const tool of capturedTools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  test("所有工具都有 description 且非空", () => {
    for (const tool of capturedTools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

function findTool(name: string): CapturedTool {
  const t = capturedTools.find(x => x.name === name);
  if (!t) throw new Error(`tool ${name} 未注册`);
  return t;
}

async function invoke(name: string, args: unknown): Promise<{ text: string; isError?: boolean }> {
  const result = (await findTool(name).callback(args)) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  return { text: result.content[0]!.text, isError: result.isError };
}

describe("工具回调:get_content", () => {
  beforeEach(() => {
    sharedFake.on("contents", "findFirst", async ({ where }: { where: { cid: number; status: number } }) => ({
      cid: where.cid,
      title: "测试文章",
      desc: "desc",
      slug: "test",
      content: "# Hello\n\nWorld",
      create_time: new Date("2026-01-01T00:00:00Z"),
      update_time: new Date("2026-01-02T00:00:00Z"),
      user: { nickname: "棋", name: "admin" },
      contentrelations: [{ metas: { slug: "tech" } }],
    }));
  });

  test("命中文章 → 返回标题/正文纯文本/作者", async () => {
    const { text } = await invoke("get_content", { cid: 1 });
    const parsed = JSON.parse(text) as { title: string; plain_text: string; author: string };
    expect(parsed.title).toBe("测试文章");
    expect(parsed.plain_text).toContain("Hello");
    expect(parsed.author).toBe("棋");
  });

  test("未命中 → isError + article_not_found", async () => {
    sharedFake.on("contents", "findFirst", async () => null);
    const r = await invoke("get_content", { cid: 999 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toMatchObject({ error: "article_not_found", cid: 999 });
  });
});

describe("工具回调:get_random_content", () => {
  test("无 categorySlug → 按总数随机 skip", async () => {
    sharedFake.on("contents", "count", async () => 5);
    let lastSkip: number | undefined;
    sharedFake.on("contents", "findMany", async ({ skip }: { skip?: number }) => {
      lastSkip = skip;
      return [{ cid: 42 }];
    });
    const { text } = await invoke("get_random_content", {});
    expect(JSON.parse(text)).toMatchObject({ cid: 42 });
    expect(typeof lastSkip).toBe("number");
    expect(lastSkip).toBeGreaterThanOrEqual(0);
    expect(lastSkip).toBeLessThan(5);
  });

  test("无任何文章 → isError", async () => {
    sharedFake.on("contents", "count", async () => 0);
    const r = await invoke("get_random_content", {});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toEqual({ error: "no_article" });
  });

  test("带 categorySlug → 走关系池随机,空池 isError", async () => {
    sharedFake.on("contents", "findMany", async () => []);
    const r = await invoke("get_random_content", { categorySlug: "tech" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toMatchObject({ categorySlug: "tech" });
  });
});

describe("工具回调:list_friend_links", () => {
  test("仅下发 name/desc/link/avatar 四个前台展示字段", async () => {
    sharedFake.on("links", "findMany", async () => [
      { name: "友站 A", desc: "desc A", link: "https://a.example", avatar: null },
    ]);
    const { text } = await invoke("list_friend_links", {});
    const parsed = JSON.parse(text) as { count: number; items: Array<{ name: string; url: string; desc: string }> };
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]).toEqual({
      name: "友站 A",
      desc: "desc A",
      url: "https://a.example",
      avatar: null,
    });
  });
});

describe("工具回调:list_changelogs", () => {
  test("解析 content JSON 字段为 entries 数组", async () => {
    sharedFake.on("changelogs", "findMany", async () => [
      { id: 1, content: JSON.stringify([{ type: "功能", value: "x" }]), create_time: new Date("2026-01-01T00:00:00Z") },
    ]);
    const { text } = await invoke("list_changelogs", { limit: 10 });
    const parsed = JSON.parse(text) as { count: number; items: Array<{ entries: unknown[] }> };
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]?.entries).toEqual([{ type: "功能", value: "x" }]);
  });

  test("content 非法 JSON → entries 兜底空数组", async () => {
    sharedFake.on("changelogs", "findMany", async () => [
      { id: 1, content: "not json", create_time: new Date() },
    ]);
    const { text } = await invoke("list_changelogs", {});
    const parsed = JSON.parse(text) as { items: Array<{ entries: unknown[] }> };
    expect(parsed.items[0]?.entries).toEqual([]);
  });
});

describe("工具回调:get_site_info", () => {
  test("从 informations 表聚合站点基础信息", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "siteName", value: "ImQi1" },
      { key: "siteUrl", value: "https://imqi1.com" },
      { key: "siteDescription", value: "blog" },
    ]);
    const { text } = await invoke("get_site_info", {});
    expect(JSON.parse(text)).toEqual({
      name: "ImQi1",
      url: "https://imqi1.com",
      description: "blog",
      beian: "",
    });
  });
});

describe("工具回调:get_recent_comments", () => {
  test("过滤掉没有分类关系的评论(避免 404 链接)", async () => {
    sharedFake.on("comments", "findMany", async () => [
      {
        coid: 1, content: "valid", name: "a", create_time: new Date("2026-01-01"),
        content_ref: { cid: 10, title: "T", slug: "t", contentrelations: [{ metas: { slug: "tech" } }] },
      },
      {
        coid: 2, content: "no-category", name: "b", create_time: new Date("2026-01-02"),
        content_ref: { cid: 11, title: "U", slug: "u", contentrelations: [] },
      },
    ]);
    const { text } = await invoke("get_recent_comments", { limit: 10 });
    const parsed = JSON.parse(text) as { count: number; items: Array<{ coid: number }> };
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]?.coid).toBe(1);
  });
});

describe("工具回调:get_related_contents", () => {
  test("文章不存在 → isError", async () => {
    sharedFake.on("contents", "findUnique", async () => null);
    const r = await invoke("get_related_contents", { cid: 999 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toMatchObject({ error: "article_not_found", cid: 999 });
  });

  test("无标签 → 直接返回空,不报错", async () => {
    sharedFake.on("contents", "findUnique", async () => ({ contentrelations: [] }));
    const { text } = await invoke("get_related_contents", { cid: 1 });
    expect(JSON.parse(text)).toMatchObject({ cid: 1, count: 0, items: [] });
  });

  test("按共享标签数倒序,截前 limit 条", async () => {
    sharedFake.on("contents", "findUnique", async () => ({
      contentrelations: [{ mid: 100 }, { mid: 101 }],
    }));
    sharedFake.on("contents", "findMany", async () => [
      {
        cid: 2, title: "两标签", slug: "t2", create_time: new Date("2026-01-01"),
        contentrelations: [{ metas: { slug: "tech" } }],
        _count: { contentrelations: 2 },
      },
      {
        cid: 3, title: "一标签", slug: "t3", create_time: new Date("2026-01-02"),
        contentrelations: [{ metas: { slug: "tech" } }],
        _count: { contentrelations: 1 },
      },
    ]);
    const { text } = await invoke("get_related_contents", { cid: 1, limit: 5 });
    const parsed = JSON.parse(text) as { items: Array<{ cid: number; shared_tags: number }> };
    expect(parsed.items.map(i => i.cid)).toEqual([2, 3]);
  });
});
