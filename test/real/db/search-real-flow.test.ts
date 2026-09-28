/**
 * 真实 DB 集成测 —— server/api/search.get 搜索
 *
 * 验证 LIKE 搜索在真实 PG 下命中正确 + 截断(SEARCH_RESULT_TAKE=50)+
 * 空结果 + 特殊字符净化(SQL 注入相关)+ 关键词长度上限。
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb } = await import("./_helpers");

const handler = (await import("#server/api/search.get")).default;

function event(q: Record<string, string>) {
  const qs = new URLSearchParams(q);
  const url = `/api/search?${qs}`;
  return {
    method: "GET",
    context: {},
    path: url,
    node: {
      req: { method: "GET", url, headers: {} },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never;
}

describe("server/api/search.get 真实 DB", () => {
  beforeAll(async () => {
    await resetDb();
    const db = await getDb();
    const now = new Date();
    // seed 10 篇含「TypeScript」的文章,5 篇含「Rust」,3 篇不含(噪声)
    await db.contents.createMany({
      data: [
        ...Array.from({ length: 10 }, (_, i) => ({
          title: `TypeScript 教程 ${i}`, slug: `ts-${i}`,
          content: `TypeScript 是 JavaScript 的超集 ${i}`, desc: null,
          status: 1, type: 0, comment_num: 0, uid: 1,
          update_time: now, create_time: now,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          title: `Rust 学习 ${i}`, slug: `rust-${i}`,
          content: `Rust 系统编程 ${i}`, desc: null,
          status: 1, type: 0, comment_num: 0, uid: 1,
          update_time: now, create_time: now,
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          title: `Go 学习 ${i}`, slug: `go-${i}`,
          content: `Go 语言 ${i}`, desc: null,
          status: 1, type: 0, comment_num: 0, uid: 1,
          update_time: now, create_time: now,
        })),
      ],
    });
  }, 60000);

  test("命中:搜索「TypeScript」返回 10 篇", async () => {
    const r = (await handler(event({ q: "TypeScript" }))) as {
      data: { results: Array<{ title: string }>; total: number };
    };
    expect(r.data.results.length).toBe(10);
    expect(r.data.total).toBe(10);
  });

  test("命中:搜索「Rust」返回 5 篇", async () => {
    const r = (await handler(event({ q: "Rust" }))) as { data: { results: unknown[]; total: number } };
    expect(r.data.results.length).toBe(5);
  });

  test("空结果:搜索「Python」无命中", async () => {
    const r = (await handler(event({ q: "Python" }))) as { data: { results: unknown[]; total: number } };
    expect(r.data.results.length).toBe(0);
    expect(r.data.total).toBe(0);
  });

  test("空关键词 → 400", async () => {
    await expect(handler(event({}))).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler(event({ q: "" }))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("关键词净化:含特殊字符(单引号/分号/反斜杠)不抛 SQL 注入", async () => {
    // 故意带 SQL 注入特征字符,期望 sanitize 后正常处理(不抛 500)
    const r = await handler(event({ q: "'; DROP TABLE contents; --" }));
    expect(r).toBeDefined();
    const r2 = await handler(event({ q: "%%\\__" }));
    expect(r2).toBeDefined();
    // 表还在
    const db = await getDb();
    expect(await db.contents.count({ where: { type: 0 } })).toBeGreaterThanOrEqual(18);
  });

  test("关键词长度上限:超过 100 字符 → 400(zod schema)", async () => {
    const longQ = "x".repeat(500);
    await expect(handler(event({ q: longQ }))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("截断:SEARCH_RESULT_TAKE=50,超过时 results 长度 ≤ 50", async () => {
    const db = await getDb();
    const now = new Date();
    await db.contents.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        title: `LimitTest ${i}`, slug: `limit-${i}-${Date.now()}`,
        content: "LimitTest content", desc: null,
        status: 1, type: 0, comment_num: 0, uid: 1,
        update_time: now, create_time: now,
      })),
    });
    const r = (await handler(event({ q: "LimitTest" }))) as { data: { results: unknown[]; total: number } };
    expect(r.data.results.length).toBeLessThanOrEqual(50);
    // total 反映 take 后的内容数(当前实现下也是 ≤50;真命中数需另查)
    expect(r.data.total).toBeLessThanOrEqual(50);
  });

  test("草稿文章(status=0)不返", async () => {
    const db = await getDb();
    await db.contents.create({ data: { title: "DraftSearch 标记", slug: `draft-${Date.now()}`, content: "DraftSearch 草稿", desc: null, status: 0, type: 0, comment_num: 0, uid: 1, update_time: new Date(), create_time: new Date() } });
    const r = (await handler(event({ q: "DraftSearch" }))) as { data: { results: unknown[] } };
    expect(r.data.results.length).toBe(0);
  });
});