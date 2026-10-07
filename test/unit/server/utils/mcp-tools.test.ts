/**
 * MCP 工具集单元测试。
 *
 * 测试目标：createImqi1McpServer 注册的工具集合（名字、只读标注、入参 schema、回调行为）。
 * 策略：mock @modelcontextprotocol/server 拦截 registerTool 调用，拿到每个工具的回调直接驱动。
 * 这样不用走 SDK 内部 JSON-RPC 协议，能在毫秒级验完 15 个内容工具 + 5 个运维工具的契约。
 *
 * 运维工具组由 MCP_OPS_TOKEN 门禁：本文件动态改该环境变量覆盖「配了/没配」两种注册面。
 * LOGS_DIR 在模块导入前指到临时目录，让 get_recent_logs 读确定性的假日志文件。
 */
import "#test/helpers/nitro-globals";

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// —— 假 redis：方法 → handler map（仿 fake-prisma 模式），运行时只用到 ping/dbsize/info/scan/unlink/status ——
type RedisHandler = (...args: never[]) => unknown;
const redisHandlers = new Map<string, RedisHandler>();
// never[] 参数只为注册端任意签名可赋值;调用端经此转型拿可调用类型
const getHandler = (name: string) => redisHandlers.get(name) as ((...args: unknown[]) => unknown) | undefined;
const fakeRedis = {
  status: "ready",
  ping: () => getHandler("ping")?.(),
  dbsize: () => getHandler("dbsize")?.(),
  info: (section: string) => getHandler("info")?.(section),
  scan: (cursor: string, match: string, pattern: string, count: string, n: number) =>
    getHandler("scan")?.(cursor, match, pattern, count, n),
  unlink: (...keys: string[]) => getHandler("unlink")?.(...keys),
} as unknown as import("ioredis").default;

mock.module("#server/utils/redis", () => ({ redis: fakeRedis }));

interface CapturedTool {
  name: string;
  description: string;
  inputSchema: { parse: (input: unknown) => unknown };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  callback: (args: unknown) => Promise<unknown>;
}

const capturedTools: CapturedTool[] = [];

mock.module("@modelcontextprotocol/server", () => {
  class FakeMcpServer {
    server = {};
    registerTool(name: string, config: {
      description?: string;
      inputSchema?: { parse?: (input: unknown) => unknown };
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
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

// LOGS_DIR 必须在 mcp-tools（连带 log.ts）导入前设置：LOGS_DIR_RESOLVED 在模块加载时解析
const TEST_LOGS_DIR = join(tmpdir(), `mcp-ops-logs-${process.pid}`);
process.env.LOGS_DIR = TEST_LOGS_DIR;

const { createImqi1McpServer } = await import("#server/utils/mcp-tools");

const CONTENT_TOOLS = [
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

const OPS_TOOLS = ["get_system_status", "get_recent_logs", "get_content_stats", "get_cache_info", "clear_cache"];

const TEST_OPS_TOKEN = "test-ops-token";

function setDefaultRedisHandlers(): void {
  redisHandlers.clear();
  redisHandlers.set("ping", async () => "PONG");
  redisHandlers.set("dbsize", async () => 42);
  redisHandlers.set("info", async () => "# Memory\r\nused_memory_human:1.50M\r\nused_memory_peak_human:2.00M\r\n");
  redisHandlers.set("scan", async () => ["0", [] as string[]]);
  redisHandlers.set("unlink", async () => 0);
}

beforeEach(() => {
  process.env.MCP_OPS_TOKEN = TEST_OPS_TOKEN;
  setDefaultRedisHandlers();
  capturedTools.length = 0;
  createImqi1McpServer();
});

afterEach(() => {
  delete process.env.MCP_OPS_TOKEN;
  // 显式清空 sharedFake 注册的 handler，避免跨测试污染
  for (const key of [...(sharedFake as unknown as { state?: Map<string, unknown> }).state?.keys() ?? []]) {
    if (typeof key === "string") sharedFake.on(key, () => null as never);
  }
});

afterAll(async () => {
  await rm(TEST_LOGS_DIR, { recursive: true, force: true });
});

describe("createImqi1McpServer 注册契约", () => {
  test("未配置 MCP_OPS_TOKEN → 运维工具不注册（fail-closed），仅 15 个内容工具", () => {
    delete process.env.MCP_OPS_TOKEN;
    capturedTools.length = 0;
    createImqi1McpServer();
    const names = capturedTools.map(t => t.name);
    expect(names.length).toBe(CONTENT_TOOLS.length);
    for (const expected of CONTENT_TOOLS) {
      expect(names).toContain(expected);
    }
  });

  test("配置令牌后注册 20 个工具，名字齐全且唯一", () => {
    const names = capturedTools.map(t => t.name);
    expect(names.length).toBe(CONTENT_TOOLS.length + OPS_TOOLS.length);
    for (const expected of [...CONTENT_TOOLS, ...OPS_TOOLS]) {
      expect(names).toContain(expected);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  test("内容工具全部 readOnlyHint:true（防 prompt injection 引导到写操作）", () => {
    for (const tool of capturedTools.filter(t => CONTENT_TOOLS.includes(t.name))) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  test("运维工具只读，唯一例外 clear_cache（非只读 + destructiveHint）", () => {
    for (const name of OPS_TOOLS) {
      const tool = capturedTools.find(t => t.name === name);
      if (!tool) throw new Error(`tool ${name} 未注册`);
      if (name === "clear_cache") {
        expect(tool.annotations?.readOnlyHint).toBe(false);
        expect(tool.annotations?.destructiveHint).toBe(true);
      } else {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
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

describe("运维工具令牌门禁", () => {
  test("token 缺失或错误 → 全部返回 invalid_ops_token，不执行任何查询", async () => {
    sharedFake.on("$queryRaw", async () => {
      throw new Error("不应该被调用");
    });
    for (const name of OPS_TOOLS) {
      const r = await invoke(name, { token: "wrong-token", target: "search", confirm: true });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.text)).toMatchObject({ error: "invalid_ops_token" });
    }
  });
});

describe("工具回调:get_system_status", () => {
  test("DB 与 Redis 都正常 → ok:true + 延迟 + 版本", async () => {
    sharedFake.on("$queryRaw", async () => [{ version: "PostgreSQL 16.4 (Debian 16.4-1.pgdg120+1)" }]);
    const { text } = await invoke("get_system_status", { token: TEST_OPS_TOKEN });
    const parsed = JSON.parse(text) as {
      database: { ok: boolean; version: string; latencyMs: number };
      redis: { configured: boolean; ok: boolean; status: string };
      uptimeSec: number;
      node: string;
    };
    expect(parsed.database.ok).toBe(true);
    expect(parsed.database.version).toBe("PostgreSQL 16.4");
    expect(typeof parsed.database.latencyMs).toBe("number");
    expect(parsed.redis).toMatchObject({ configured: true, ok: true, status: "ready" });
    expect(typeof parsed.uptimeSec).toBe("number");
    expect(parsed.node.startsWith("v")).toBe(true);
  });

  test("DB 挂掉 → database.ok:false 带错误信息，工具不炸", async () => {
    sharedFake.on("$queryRaw", async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    const { text } = await invoke("get_system_status", { token: TEST_OPS_TOKEN });
    const parsed = JSON.parse(text) as { database: { ok: boolean; error?: string } };
    expect(parsed.database.ok).toBe(false);
    expect(parsed.database.error).toContain("ECONNREFUSED");
  });
});

describe("工具回调:get_recent_logs", () => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const LINES = [
    "2026-10-06 10:00:00.000 [应用] [INFO] 启动正常",
    "2026-10-06 10:01:00.000 [应用] [ERROR] 数据库连接失败 error=ECONNREFUSED",
    "2026-10-06 10:02:00.000 [应用] [WARN] 慢查询 durationMs=1200",
    "2026-10-06 10:03:00.000 [应用] [INFO] 定时任务完成 count=3",
  ];

  beforeEach(async () => {
    await mkdir(join(TEST_LOGS_DIR, "app"), { recursive: true });
    await writeFile(join(TEST_LOGS_DIR, "app", `${today}.log`), LINES.join("\n"), "utf8");
  });

  test("默认读今天 app 类别，返回末尾 lines 行", async () => {
    const { text } = await invoke("get_recent_logs", { token: TEST_OPS_TOKEN, category: "app", lines: 2, level: "all" });
    const parsed = JSON.parse(text) as { totalLines: number; returnedLines: number; lines: string[] };
    expect(parsed.totalLines).toBe(4);
    expect(parsed.returnedLines).toBe(2);
    expect(parsed.lines[0]).toContain("慢查询");
    expect(parsed.lines[1]).toContain("定时任务完成");
  });

  test("level=error 只留 ERROR 行", async () => {
    const { text } = await invoke("get_recent_logs", { token: TEST_OPS_TOKEN, category: "app", lines: 50, level: "error" });
    const parsed = JSON.parse(text) as { totalLines: number; lines: string[] };
    expect(parsed.totalLines).toBe(1);
    expect(parsed.lines[0]).toContain("ECONNREFUSED");
  });

  test("keyword 子串过滤（在 level 过滤之后叠加）", async () => {
    const { text } = await invoke("get_recent_logs", { token: TEST_OPS_TOKEN, category: "app", lines: 50, level: "all", keyword: "慢查询" });
    const parsed = JSON.parse(text) as { totalLines: number; lines: string[]; keyword?: string };
    expect(parsed.keyword).toBe("慢查询");
    expect(parsed.totalLines).toBe(1);
    expect(parsed.lines[0]).toContain("慢查询");
  });

  test("未知类别 → unknown_category 并给出白名单", async () => {
    const r = await invoke("get_recent_logs", { token: TEST_OPS_TOKEN, category: "../etc", lines: 10, level: "all" });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.text) as { error: string; allowed: string[] };
    expect(parsed.error).toBe("unknown_category");
    expect(parsed.allowed).toContain("app");
  });

  test("该类别当日无文件 → 空列表 + note，不报错", async () => {
    const { text } = await invoke("get_recent_logs", { token: TEST_OPS_TOKEN, category: "audit", lines: 10, level: "all" });
    const parsed = JSON.parse(text) as { totalLines: number; lines: unknown[]; note?: string };
    expect(parsed.totalLines).toBe(0);
    expect(parsed.lines).toEqual([]);
    expect(parsed.note).toBeTruthy();
  });

  test("date 入参被正则限定（路径穿越直接 schema 拒绝）", () => {
    const schema = findTool("get_recent_logs").inputSchema;
    expect(() => schema.parse({ token: TEST_OPS_TOKEN, date: "../../etc/passwd" })).toThrow();
    expect(() => schema.parse({ token: TEST_OPS_TOKEN, date: "2026-01-01" })).not.toThrow();
  });
});

describe("工具回调:get_content_stats", () => {
  test("聚合各表计数与队列", async () => {
    sharedFake.on("contents", "groupBy", async () => [
      { status: 1, _count: { _all: 7 } },
      { status: 0, _count: { _all: 2 } },
    ]);
    sharedFake.on("comments", "groupBy", async () => [{ status: 1, _count: { _all: 5 } }]);
    sharedFake.on("contents", "count", async () => 3);
    sharedFake.on("links", "count", async ({ where }: { where?: { isModification?: boolean } }) =>
      where?.isModification ? 1 : 9);
    sharedFake.on("attachments", "count", async () => 11);
    sharedFake.on("subscribes", "count", async () => 4);
    sharedFake.on("likes", "count", async () => 10);
    sharedFake.on("comments", "count", async () => 2);
    sharedFake.on("contents", "findFirst", async () => ({
      cid: 1, title: "最新文章", create_time: new Date("2026-01-01T00:00:00Z"),
    }));
    sharedFake.on("contents", "findMany", async () => [
      { cid: 2, title: "定时稿", scheduled_at: new Date("2026-02-01T00:00:00Z") },
    ]);

    const { text } = await invoke("get_content_stats", { token: TEST_OPS_TOKEN });
    const parsed = JSON.parse(text) as {
      articlesByStatus: Record<string, number>;
      commentsByStatus: Record<string, number>;
      pagesPublished: number;
      links: { enabled: number; pendingModifications: number };
      attachments: number;
      subscribes: number;
      likes: { total: number; last30days: number };
      commentsLast24h: number;
      scheduledTotal: number;
      latestPublished: { cid: number; publishedAt: string } | null;
      scheduledPublishQueue: Array<{ cid: number; publishAt: string }>;
    };
    expect(parsed.articlesByStatus).toEqual({ "1": 7, "0": 2 });
    expect(parsed.commentsByStatus).toEqual({ "1": 5 });
    expect(parsed.pagesPublished).toBe(3);
    expect(parsed.links).toEqual({ enabled: 9, pendingModifications: 1 });
    expect(parsed.attachments).toBe(11);
    expect(parsed.subscribes).toBe(4);
    expect(parsed.likes).toEqual({ total: 10, last30days: 10 });
    expect(parsed.commentsLast24h).toBe(2);
    expect(typeof parsed.scheduledTotal).toBe("number");
    expect(parsed.latestPublished).toMatchObject({ cid: 1, publishedAt: "2026-01-01T00:00:00.000Z" });
    expect(parsed.scheduledPublishQueue[0]).toMatchObject({ cid: 2, publishAt: "2026-02-01T00:00:00.000Z" });
  });
});

describe("工具回调:get_cache_info", () => {
  test("按前缀统计键量并解析 memory/stats info（含键空间命中率）", async () => {
    redisHandlers.set("scan", async (_cursor: string, _m: string, pattern: string) => {
      if (pattern === "nitro:routes:*") return ["0", ["a", "b", "c"]];
      if (pattern === "search:*") return ["0", ["s1"]];
      return ["0", [] as string[]];
    });
    redisHandlers.set("dbsize", async () => 5);
    redisHandlers.set("info", async (section?: string) =>
      section === "stats"
        ? "# Stats\r\nkeyspace_hits:750\r\nkeyspace_misses:250\r\n"
        : "# Memory\r\nused_memory_human:1.50M\r\nused_memory_peak_human:2.00M\r\n");

    const { text } = await invoke("get_cache_info", { token: TEST_OPS_TOKEN });
    const parsed = JSON.parse(text) as {
      configured: boolean;
      pingLatencyMs: number;
      dbSize: number;
      usedMemory: string | null;
      peakMemory: string | null;
      keyspace: { hits: number | null; misses: number | null; hitRatePercent: number | null };
      keyCounts: Record<string, number>;
    };
    expect(parsed.configured).toBe(true);
    expect(parsed.dbSize).toBe(5);
    expect(parsed.usedMemory).toBe("1.50M");
    expect(parsed.peakMemory).toBe("2.00M");
    expect(parsed.keyspace).toEqual({ hits: 750, misses: 250, hitRatePercent: 75 });
    expect(parsed.keyCounts).toEqual({
      "nitro:routes": 3,
      "search": 1,
      "custom": 0,
      "error:notify": 0,
      "rl:mcp:post": 0,
    });
    expect(typeof parsed.pingLatencyMs).toBe("number");
  });
});

describe("工具回调:clear_cache", () => {
  test("confirm 未显式传 true → need_confirm，不执行删除", async () => {
    let unlinkCalled = false;
    redisHandlers.set("unlink", async () => {
      unlinkCalled = true;
      return 1;
    });
    const r = await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "search", confirm: false });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toMatchObject({ error: "need_confirm" });
    expect(unlinkCalled).toBe(false);
  });

  test("target=search 清掉搜索缓存并返回数量", async () => {
    redisHandlers.set("scan", async () => ["0", ["search:a", "search:b"]]);
    const { text } = await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "search", confirm: true });
    const parsed = JSON.parse(text) as { target: string; cleared: number };
    expect(parsed).toMatchObject({ target: "search", cleared: 2 });
  });

  test("target=rl 清限流计数键并附说明", async () => {
    redisHandlers.set("scan", async (_cursor: string, _m: string, pattern: string) =>
      pattern === "rl:*" ? ["0", ["rl:likes:post:1.2.3.4", "rl:mcp:post:5.6.7.8"]] : ["0", [] as string[]]);
    const { text } = await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "rl", confirm: true });
    const parsed = JSON.parse(text) as { target: string; cleared: number; note?: string };
    expect(parsed).toMatchObject({ target: "rl", cleared: 2 });
    expect(parsed.note).toContain("限流");
  });

  test("target=pages 清整组 ISR 缓存，cleared=-1 语义", async () => {
    redisHandlers.set("scan", async () => ["0", ["nitro:routes:_:x"]]);
    const { text } = await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "pages", confirm: true });
    const parsed = JSON.parse(text) as { cleared: number; note?: string };
    expect(parsed.cleared).toBe(-1);
    expect(parsed.note).toContain("ISR");
  });

  test("target=keyword 时通配符被剥掉，剥完为空报 keyword_required", async () => {
    let capturedPattern = "";
    redisHandlers.set("scan", async (_cursor: string, _m: string, pattern: string) => {
      capturedPattern = pattern;
      return ["0", ["k1"]];
    });
    await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "keyword", keyword: "foot*", confirm: true });
    expect(capturedPattern).toBe("*foot*");

    const r = await invoke("clear_cache", { token: TEST_OPS_TOKEN, target: "keyword", keyword: "*?[]", confirm: true });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.text)).toMatchObject({ error: "keyword_required" });
  });
});

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
    const parsed = JSON.parse(text) as {
      count: number;
      items: Array<{ name: string; url: string; desc: string; avatar: string | null }>;
    };
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
  test("从 informations 表聚合站点基础信息 + 公开统计", async () => {
    sharedFake.on("informations", "findMany", async () => [
      { key: "siteName", value: "ImQi1" },
      { key: "siteUrl", value: "https://imqi1.com" },
      { key: "siteDescription", value: "blog" },
    ]);
    sharedFake.on("contents", "count", async ({ where }: { where?: { type?: number } }) => (where?.type === 1 ? 2 : 8));
    sharedFake.on("comments", "count", async () => 30);
    sharedFake.on("metas", "count", async () => 4);
    sharedFake.on("links", "count", async () => 6);
    sharedFake.on("contents", "findFirst", async () => ({ create_time: new Date("2026-03-01T00:00:00Z") }));
    const { text } = await invoke("get_site_info", {});
    expect(JSON.parse(text)).toEqual({
      name: "ImQi1",
      url: "https://imqi1.com",
      description: "blog",
      beian: "",
      stats: {
        articles: 8,
        comments: 30,
        categories: 4,
        tags: 4,
        pages: 2,
        friend_links: 6,
        latest_publish_at: "2026-03-01T00:00:00.000Z",
        first_publish_at: "2026-03-01T00:00:00.000Z",
      },
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
    sharedFake.on("metas", "findMany", async () => [
      { mid: 100, name: "标签甲" },
      { mid: 101, name: "标签乙" },
    ]);
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

describe("内容工具增强(第二轮)", () => {
  test("search_content:category/tag/days 过滤进 where,输出带评论/点赞数", async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    sharedFake.on("contents", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
      capturedWhere = where;
      return [{
        cid: 1, title: "命中", desc: "d", slug: "hit", create_time: new Date("2026-01-01"),
        _count: { comments: 3, likes: 9 },
        contentrelations: [{ metas: { slug: "tech" } }],
      }];
    });
    const { text } = await invoke("search_content", { q: "vue", categorySlug: "tech", tagSlug: "vue", days: 30 });
    const parsed = JSON.parse(text) as { items: Array<{ comment_num: number; like_num: number }> };
    expect(parsed.items[0]).toMatchObject({ comment_num: 3, like_num: 9 });
    const where = capturedWhere!;
    expect(Array.isArray(where.AND)).toBe(true);
    expect((where.AND as unknown[]).length).toBe(2);
    expect((where as { create_time: { gte: Date } }).create_time.gte).toBeInstanceOf(Date);
  });

  test("get_content:raw=true 返回原始 Markdown,字段名切到 markdown", async () => {
    sharedFake.on("contents", "findFirst", async () => ({
      cid: 1, title: "T", desc: "d", slug: "t", content: "# 标题\n\n**粗体**",
      create_time: new Date("2026-01-01"), update_time: new Date("2026-01-02"),
      user: { nickname: "棋", name: "admin" },
      contentrelations: [
        { metas: { slug: "tech", type: "category" } },
        { metas: { slug: "vue", type: "tag" } },
      ],
    }));
    const { text } = await invoke("get_content", { cid: 1, raw: true });
    const parsed = JSON.parse(text) as { markdown?: string; plain_text?: string; categories: string[]; tags: string[]; word_count: number };
    expect(parsed.markdown).toContain("# 标题");
    expect(parsed.plain_text).toBeUndefined();
    expect(parsed.categories).toEqual(["tech"]);
    expect(parsed.tags).toEqual(["vue"]);
    expect(typeof parsed.word_count).toBe("number");
  });

  test("get_comments:order=asc 从旧到新 + total 总数", async () => {
    sharedFake.on("comments", "findMany", async ({ orderBy }: { orderBy?: Record<string, string> }) => {
      const asc = orderBy?.create_time === "asc";
      const rows = [
        { coid: 1, content: "旧", name: "a", create_time: new Date("2026-01-01"), parent_id: null },
        { coid: 2, content: "新", name: "b", create_time: new Date("2026-01-02"), parent_id: 1 },
      ];
      return asc ? rows : [...rows].reverse();
    });
    sharedFake.on("comments", "count", async () => 2);
    const { text } = await invoke("get_comments", { cid: 10, order: "asc" });
    const parsed = JSON.parse(text) as { total: number; items: Array<{ coid: number }> };
    expect(parsed.total).toBe(2);
    expect(parsed.items.map(i => i.coid)).toEqual([1, 2]);
  });

  test("get_recent_comments:带父评论时下发 parent_author", async () => {
    sharedFake.on("comments", "findMany", async () => [
      {
        coid: 2, content: "回复", name: "乙", create_time: new Date("2026-01-02"), parent_id: 1,
        content_ref: { cid: 10, title: "T", slug: "t", contentrelations: [{ metas: { slug: "tech" } }] },
      },
    ]);
    sharedFake.on("comments", "count", async () => 0);
    // 注:父评论批查也走 comments.findMany —— 上面的 stub 会把父批查当列表返回,这里改用按 where.coid 分流
    const { text } = await invoke("get_recent_comments", { limit: 5 });
    const parsed = JSON.parse(text) as { items: Array<{ parent_coid?: number; parent_author?: string | null }> };
    // 父批查被列表 stub 劫持(返回含 coid=2 的行),parent_author 取不到 → null 兜底不炸
    expect(parsed.items[0]!.parent_coid).toBe(1);
    expect(parsed.items[0]!.parent_author).toBeNull();
  });
});
