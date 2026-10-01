/**
 * 真实 DB 集成测 —— admin/contents/[cid].delete
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import { CSRF_HEADER } from "#shared/constants";

const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie, seedCategory, seedContent } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const handler = (await import("#server/api/admin/contents/[cid].delete")).default;

describe("admin/contents/[cid].delete(真实 DB)", () => {
  registerDbReset();
  test("成功 → 文章删 + 关联 contentrelations 全清", async () => {
    const cat = await seedCategory({ name: "C", slug: "c" });
    const post = await seedContent({ title: "P", slug: "p" });
    const db = await getDb();
    await db.contentrelations.create({ data: { cid: post.cid, mid: cat.mid } });

    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/contents/${post.cid}`,
      cookie, params: { cid: String(post.cid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);

    expect(await db.contents.findUnique({ where: { cid: post.cid } })).toBeNull();
    expect(await db.contentrelations.count({ where: { cid: post.cid } })).toBe(0);
    // 分类仍存在(不应连带删)
    expect(await db.metas.findUnique({ where: { mid: cat.mid } })).not.toBeNull();
  });

  test("cid 不存在 → 404", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: "/api/admin/contents/9999",
      cookie, params: { cid: "9999" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("cid 非正整数 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: "/api/admin/contents/abc",
      cookie, params: { cid: "abc" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺 → 403 + DB 不动", async () => {
    const post = await seedContent({ title: "P", slug: "p" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/contents/${post.cid}`,
      cookie, params: { cid: String(post.cid) },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.contents.findUnique({ where: { cid: post.cid } })).not.toBeNull();
  });

  test("未登录 → 401", async () => {
    const post = await seedContent({ title: "P", slug: "p" });
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/contents/${post.cid}`,
      params: { cid: String(post.cid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });

    const db = await getDb();
    expect(await db.contents.findUnique({ where: { cid: post.cid } })).not.toBeNull();
  });
});