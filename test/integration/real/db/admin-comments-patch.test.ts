/**
 * 真实 DB 集成测 —— admin/comments/[id].patch(审核/状态更新)
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";


const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const handler = (await import("#server/api/admin/comments/[id].patch")).default;

async function seedComment(overrides: Partial<{ cid?: number; status: number; content: string }> = {}) {
  const db = await getDb();
  // 评论 FK 到 contents(cid),所以先 seed 一篇 content(默认 type=0)
  const post = await db.contents.create({
    data: {
      title: "测试文",
      slug: "test-post-for-comment",
      status: 1, type: 0,
      content: "x",
      update_time: new Date(),
      create_time: new Date(),
    },
  });
  return db.comments.create({
    data: {
      cid: overrides.cid ?? post.cid,
      name: "访客",
      content: overrides.content ?? "评论正文",
      status: overrides.status ?? 0,
    },
  });
}

describe("admin/comments/[id].patch(真实 DB)", () => {
  registerDbReset();
  test("成功 → status 真实更新(0 待审核 → 1 已通过)", async () => {
    const com = await seedComment({ status: 0 });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    }) as { success: boolean; data: { coid: number; status: number } };
    expect(r.success).toBe(true);
    expect(r.data.status).toBe(1);

    const db = await getDb();
    const row = await db.comments.findUnique({ where: { coid: com.coid } });
    expect(row!.status).toBe(1);
  });

  test("已通过 → 反向(1 → 0)允许(撤回到待审核,真实 DB 更新 + 计数-1)", async () => {
    const com = await seedComment({ status: 1 });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 0 },
    }) as { success: boolean; data: { status: number } };
    expect(r.success).toBe(true);
    expect(r.data.status).toBe(0);
  });

  test("coid 不存在 → 404", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PATCH", url: "/api/admin/comments/9999",
      cookie, params: { id: "9999" },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("status 非法值(3) → 400(0/1/2 之外)", async () => {
    const com = await seedComment({ status: 0 });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 3 },
    })).rejects.toMatchObject({ statusCode: 400, message: "评论状态非法" });
  });

  test("status=2(spam)→ 允许(写入 spam 状态)", async () => {
    const com = await seedComment({ status: 0 });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 2 },
    }) as { success: boolean; data: { status: number } };
    expect(r.success).toBe(true);
    expect(r.data.status).toBe(2);
  });

  test("CSRF 缺 → 403", async () => {
    const com = await seedComment({ status: 0 });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      cookie, params: { id: String(com.coid) },
      body: { status: 1 },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    const row = await db.comments.findUnique({ where: { coid: com.coid } });
    expect(row!.status).toBe(0); // 未变
  });

  test("未登录 → 401", async () => {
    const com = await seedComment({ status: 0 });
    await expect(callDbAdmin(handler, {
      method: "PATCH", url: `/api/admin/comments/${com.coid}`,
      params: { id: String(com.coid) },
      body: { csrfToken: CSRF_TOKEN, status: 1 },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});