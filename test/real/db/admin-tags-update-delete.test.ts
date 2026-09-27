/**
 * 真实 DB 集成测 —— admin/tags/[id].put + admin/tags/[id].delete
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
const putHandler = (await import("#server/api/admin/tags/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/tags/[id].delete")).default;

async function makeContentRelation(cid: number, mid: number) {
  const db = await getDb();
  await db.contentrelations.create({ data: { cid, mid } });
}

describe("admin/tags/[id].put(真实 DB)", () => {
  registerDbReset();
  test("成功 → name/slug/desc 真实 UPDATE", async () => {
    const tag = await seedCategory({ name: "旧", slug: "old", type: "tag" });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "新名", slug: "new", desc: "新 desc" },
    }) as { mid: number; name: string; slug: string };
    expect(r.name).toBe("新名");
    expect(r.slug).toBe("new");

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: tag.mid } });
    expect(row!.name).toBe("新名");
    expect(row!.type).toBe("tag"); // 没被改成 category
  });

  test("传 category 的 mid → 404(updateMany 限定 type='tag')", async () => {
    const cat = await seedCategory({ name: "C", slug: "c" }); // 默认 type=category
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/tags/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 404, message: "标签不存在" });
  });

  test("name 已被其它 tag 占用 → 400 P2002", async () => {
    await seedCategory({ name: "占", slug: "a", type: "tag" });
    const tag = await seedCategory({ name: "B", slug: "b", type: "tag" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "占" },
    })).rejects.toMatchObject({ statusCode: 400, message: "标签名称或标识(slug)已存在" });
  });

  test("name 空 → 400", async () => {
    const tag = await seedCategory({ name: "原", slug: "y", type: "tag" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: "/api/admin/tags/abc",
      cookie, params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: "/api/admin/tags/1",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("admin/tags/[id].delete(真实 DB)", () => {
  registerDbReset();
  test("成功 → 删 tag + 删 contentrelations(原子事务)", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    const post = await seedContent({ title: "p", slug: "p" });
    await makeContentRelation(post.cid, tag.mid);

    const cookie = await loginDbCookie();
    const r = await callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: tag.mid } })).toBeNull();
    expect(await db.contentrelations.count({ where: { mid: tag.mid } })).toBe(0);
  });

  test("传 category 的 mid → 400 只能删除标签类型", async () => {
    const cat = await seedCategory({ name: "C", slug: "c" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/tags/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400, message: "只能删除标签类型" });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat.mid } })).not.toBeNull();
  });

  test("mid 不存在 → 404", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/tags/9999",
      cookie, params: { id: "9999" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404, message: "标签不存在" });
  });

  test("CSRF 缺 → 403 + DB 不动", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: tag.mid } })).not.toBeNull();
  });

  test("并发删除竞态 → P2025 转 404", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    const db = await getDb();
    await db.metas.delete({ where: { mid: tag.mid } }); // 模拟并发先删

    const cookie = await loginDbCookie();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/tags/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("未登录 → 401 + DB 不动", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/tags/${tag.mid}`,
      params: { id: String(tag.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: tag.mid } })).not.toBeNull();
  });
});