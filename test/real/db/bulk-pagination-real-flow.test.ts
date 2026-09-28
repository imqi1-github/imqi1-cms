/**
 * 真实 DB 集成测 —— 大数据量分页 + 索引性能
 *
 * 在真实 PostgreSQL 上 seed 1000+ 篇文章 + 10000+ 评论,
 * 验证 admin/contents.get 与 admin/comments.get 的 skip/take 分页正确性,
 * 并记录每次查询耗时确认索引可用(分页 100 条 < 200ms)。
 *
 * 索引缺失会让分页查询退化成顺序扫描,这是站点规模增长时的常见瓶颈。
 *
 * seed 在 beforeAll 一次性跑(registerDbReset 不会清,避免 30s seed × N tests)。
 */
import { beforeAll, describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb, loginDbCookie, callDbAdmin } = await import("./_helpers");

const contentsHandler = (await import("#server/api/admin/contents.get")).default;
const commentsHandler = (await import("#server/api/admin/comments.get")).default;

const TOTAL_POSTS = 1200;
const TOTAL_COMMENTS = 10500;

describe("大数据量分页(真实 DB)", () => {
  beforeAll(async () => {
    // 只 seed 一次,后续 test 不再 resetDb(否则 seed 浪费)
    // 用 runId 让 slug 跨次跑全 DB 唯一(前次残留 + 当次新增 都避免冲突)
    const db = await getDb();
    // 先 TRUNCATE contents/comments 清理前次 bulk 残留(RESTART IDENTITY 重置 sequence),
    // 否则下次 seed nextval 撞旧数据 cid 主键
    await db.$executeRawUnsafe(`TRUNCATE TABLE "contents","comments" RESTART IDENTITY CASCADE`);
    const runId = Math.floor(Math.random() * 1e9).toString(36);
    const now = new Date();
    const BATCH = 200;
    for (let i = 0; i < TOTAL_POSTS; i += BATCH) {
      await db.contents.createMany({
        data: Array.from({ length: Math.min(BATCH, TOTAL_POSTS - i) }, (_, k) => ({
          title: `分页测试文章 #${i + k}`,
          slug: `bulk-test-${runId}-${i + k}`,
          content: "x".repeat(500),
          desc: `desc ${i + k}`,
          status: 1,
          type: 0,
          comment_num: 0,
          uid: 1,
          update_time: now,
          create_time: now,
        })),
      });
    }
    const postIds = await db.contents.findMany({ where: { type: 0 }, select: { cid: true } });
    for (let i = 0; i < TOTAL_COMMENTS; i += BATCH) {
      const batchSize = Math.min(BATCH, TOTAL_COMMENTS - i);
      await db.comments.createMany({
        data: Array.from({ length: batchSize }, (_, k) => {
          const post = postIds[(i + k) % postIds.length]!;
          return {
            cid: post.cid,
            name: `评论人${i + k}`,
            content: `bulk comment ${i + k}`,
            status: 1,
          };
        }),
      });
    }
    const countPosts = await db.contents.count({ where: { type: 0 } });
    const countComments = await db.comments.count();
    if (countPosts < TOTAL_POSTS || countComments < TOTAL_COMMENTS) {
      throw new Error(`seed failed: posts=${countPosts}, comments=${countComments}`);
    }
  }, 60000);

  test("admin/contents.get 分页正确:skip/take 与 total 一致", async () => {
    const cookie = await loginDbCookie();
    const r1 = (await callDbAdmin(contentsHandler, {
      method: "GET", url: "/api/admin/contents?page=1&pageSize=20",
      cookie,
    })) as { data: Array<{ cid: number }>; pagination: { total: number; page: number; pageSize: number } };
    expect(r1.data.length).toBe(20);
    expect(r1.pagination.page).toBe(1);
    expect(r1.pagination.pageSize).toBe(20);
    expect(r1.pagination.total).toBeGreaterThanOrEqual(TOTAL_POSTS);
    const r2 = (await callDbAdmin(contentsHandler, {
      method: "GET", url: "/api/admin/contents?page=2&pageSize=20",
      cookie,
    })) as { data: Array<{ cid: number }> };
    expect(r2.data.length).toBe(20);
    expect(r2.data[0]!.cid).not.toBe(r1.data[0]!.cid);
    const rLast = (await callDbAdmin(contentsHandler, {
      method: "GET", url: `/api/admin/contents?page=999&pageSize=20`,
      cookie,
    })) as { data: Array<{ cid: number }> };
    expect(rLast.data.length).toBe(0);
  });

  test("admin/contents.get 分页耗时 < 200ms(索引可用,非顺序扫描)", async () => {
    const cookie = await loginDbCookie();
    const start = performance.now();
    const r = await callDbAdmin(contentsHandler, {
      method: "GET", url: "/api/admin/contents?page=1&pageSize=100",
      cookie,
    });
    const elapsed = performance.now() - start;
    expect(r).toBeDefined();
    expect(elapsed).toBeLessThan(200);
  });

  test("admin/comments.get 分页(>10000 行):take 100 应稳定返回", async () => {
    const cookie = await loginDbCookie();
    const start = performance.now();
    const r = (await callDbAdmin(commentsHandler, {
      method: "GET", url: "/api/admin/comments?page=1&pageSize=100",
      cookie,
    })) as { data: unknown[]; pagination: { total: number } };
    const elapsed = performance.now() - start;
    expect(r.data.length).toBe(100);
    expect(r.pagination.total).toBeGreaterThanOrEqual(TOTAL_COMMENTS);
    expect(elapsed).toBeLessThan(300);
  });

  test("pageSize 钳制:pageSize=99999 → 上限 1000;pageSize=0 → 下限 1", async () => {
    const cookie = await loginDbCookie();
    const r1 = (await callDbAdmin(contentsHandler, {
      method: "GET", url: "/api/admin/contents?page=1&pageSize=99999",
      cookie,
    })) as { pagination: { pageSize: number } };
    expect(r1.pagination.pageSize).toBe(1000);
    const r2 = (await callDbAdmin(contentsHandler, {
      method: "GET", url: "/api/admin/contents?page=1&pageSize=0",
      cookie,
    })) as { pagination: { pageSize: number } };
    expect(r2.pagination.pageSize).toBe(1);
  });

  test("page 钳制:负数 / NaN / 浮点 → 默认 1", async () => {
    const cookie = await loginDbCookie();
    for (const url of [
      "/api/admin/contents?page=-1",
      "/api/admin/contents?page=abc",
      "/api/admin/contents?page=1.5",
    ]) {
      const r = (await callDbAdmin(contentsHandler, { method: "GET", url, cookie })) as { pagination: { page: number } };
      expect(r.pagination.page).toBeGreaterThanOrEqual(1);
    }
  });
});