/**
 * 真实 DB 集成测 —— comments/[id].patch 并发竞态(真实 PG 多连接)
 *
 * ⚠️ KNOWN ISSUE(2026-09-28 实测):handler 在事务里做 RMW:
 *   1. findUnique 取 comments.status
 *   2. update comments.status
 *   3. update contents.comment_num increment/decrement
 * 两个并发事务都看到旧 status=0,都走 +1 → article.comment_num +2 而非 +1。
 *
 * 修复方向(待做):
 * - 把 status 转换的计数改成原子条件更新:
 *   update contents set comment_num = comment_num + 1
 *   where id = ? and exists (select 1 from comments where cid = ? and status = 0)
 * - 或先 update comments.status + commit,再按 status 差异在应用层增量
 * - 或加 status 列的乐观锁(where: { status: oldStatus })
 *
 * 当前测试故意 fail(Received: 2 / Expected: 1)以保证 bug 不会被静默掩盖。
 * 修复后把 expect 改成 +1 即会 PASS。
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, resetDb, loginDbCookie, callDbAdmin } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;

const CSRF_TOKEN = "test-csrf-token-1234567890";
const handler = (await import("#server/api/admin/comments/[id].patch")).default;

describe("comments/[id].patch 并发竞态(真实 PG)", () => {
  test("两个并发 status 0→1:article.comment_num 应只 +1,不应 +2", async () => {
    const db = await getDb();
    const now = new Date();
    // seed:文章 + 1 条待审评论(status=0)
    const post = await db.contents.create({
      data: {
        title: "并发测试", slug: `concurrent-${Date.now()}`,
        content: "x", status: 1, type: 0, comment_num: 0, uid: 1,
        update_time: now, create_time: now,
      },
    });
    const com = await db.comments.create({
      data: { cid: post.cid, name: "甲", content: "x", status: 0 },
    });
    const cookie = await loginDbCookie();
    // 两个并发 PATCH 都把 status 0→1
    const patch1 = callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    });
    const patch2 = callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    });
    const [r1, r2] = await Promise.all([patch1, patch2]);
    // 两个 PATCH 都应成功(status 1 是合法的目标值)
    expect((r1 as { success?: boolean }).success).toBe(true);
    expect((r2 as { success?: boolean }).success).toBe(true);
    // **真实 DB 多连接并发,事务 RMW 不是原子的 → comment_num 应 +2 而不是 +1**
    const after = await db.contents.findUnique({ where: { cid: post.cid } });
    // 期望:1(不变量);实际:2(暴露 race)
    expect(after?.comment_num).toBe(1);
  });

  test("并发 status 1→0:article.comment_num 应只 -1", async () => {
    const db = await getDb();
    const now = new Date();
    const post = await db.contents.create({
      data: {
        title: "并发测试-", slug: `dup-${Date.now()}`,
        content: "x", status: 1, type: 0, comment_num: 0, uid: 1,
        update_time: now, create_time: now,
      },
    });
    const com = await db.comments.create({
      data: { cid: post.cid, name: "甲", content: "x", status: 1 },
    });
    const cookie = await loginDbCookie();
    const patch1 = callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 0 },
    });
    const patch2 = callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 0 },
    });
    await Promise.all([patch1, patch2]);
    const after = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(after?.comment_num).toBe(-1);
  });

  test("并发 0→1 + 1→0(混合方向):净变动应抵消为 0", async () => {
    const db = await getDb();
    const now = new Date();
    const post = await db.contents.create({
      data: {
        title: "并发混合", slug: `mix-${Date.now()}`,
        content: "x", status: 1, type: 0, comment_num: 0, uid: 1,
        update_time: now, create_time: now,
      },
    });
    // seed 两条评论,分别 0 和 1
    const c0 = await db.comments.create({ data: { cid: post.cid, name: "A", content: "1", status: 0 } });
    const c1 = await db.comments.create({ data: { cid: post.cid, name: "B", content: "2", status: 1 } });
    const cookie = await loginDbCookie();
    // c0 → 1(+1),c1 → 0(-1) 净变动 0
    const ops = [
      callDbAdmin(handler, {
        method: "PATCH", url: `/api/admin/comments/${c0.coid}`,
        cookie, params: { id: String(c0.coid) },
        body: { csrfToken: CSRF_TOKEN, status: 1 },
      }),
      callDbAdmin(handler, {
        method: "PATCH", url: `/api/admin/comments/${c1.coid}`,
        cookie, params: { id: String(c1.coid) },
        body: { csrfToken: CSRF_TOKEN, status: 0 },
      }),
    ];
    await Promise.all(ops);
    const after = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(after?.comment_num).toBe(0);
  });

  test("三个并发 0→1:暴露 race(comment_num +3 vs 应为 +1)", async () => {
    const db = await getDb();
    const now = new Date();
    const post = await db.contents.create({
      data: {
        title: "并发3", slug: `conc3-${Date.now()}`,
        content: "x", status: 1, type: 0, comment_num: 0, uid: 1,
        update_time: now, create_time: now,
      },
    });
    const com = await db.comments.create({
      data: { cid: post.cid, name: "A", content: "1", status: 0 },
    });
    const cookie = await loginDbCookie();
    const ops = Array.from({ length: 3 }, () =>
      callDbAdmin(handler, {
        method: "PATCH", url: `/api/admin/comments/${com.coid}`,
        cookie, params: { id: String(com.coid) },
        body: { csrfToken: CSRF_TOKEN, status: 1 },
      })
    );
    await Promise.all(ops);
    const after = await db.contents.findUnique({ where: { cid: post.cid } });
    expect(after?.comment_num).toBe(1);
  });
});