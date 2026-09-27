/**
 * 真实 DB 集成测 —— admin/categories/[id].delete
 * 关键:FOR UPDATE 行锁 + 「至少保留一个分类」守卫 + 文章迁移到目标分类
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
const handler = (await import("#server/api/admin/categories/[id].delete")).default;

async function createRelation(cid: number, mid: number) {
  const db = await getDb();
  await db.contentrelations.create({ data: { cid, mid } });
}

describe("admin/categories/[id].delete(真实 DB)", () => {
  registerDbReset();
  test("成功 → seed 2 个 + 删 1 个,DB 留下另一个", async () => {
    const cat1 = await seedCategory({ name: "A", slug: "a" });
    const cat2 = await seedCategory({ name: "B", slug: "b" });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat1.mid}`,
      cookie, params: { id: String(cat1.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat1.mid } })).toBeNull();
    expect(await db.metas.findUnique({ where: { mid: cat2.mid } })).not.toBeNull();
  });

  test("「至少保留一个分类」守卫 → 400(只剩一个分类时拒绝删)", async () => {
    const cat = await seedCategory({ name: "唯一", slug: "only" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400, message: "至少需要保留一个分类" });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat.mid } })).not.toBeNull();
  });

  test("有 2 个分类时删一个,文章关联迁移到另一个", async () => {
    const cat1 = await seedCategory({ name: "源", slug: "src" });
    const cat2 = await seedCategory({ name: "目标", slug: "tgt" });
    const post = await seedContent({ title: "迁移文", slug: "migrate" });
    await createRelation(post.cid, cat1.mid);

    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat1.mid}`,
      cookie, params: { id: String(cat1.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat1.mid } })).toBeNull();
    const rels = await db.contentrelations.findMany({ where: { cid: post.cid } });
    expect(rels).toHaveLength(1);
    expect(rels[0]!.mid).toBe(cat2.mid);
  });

  test("文章原本就有其它分类 → 只删源关联,不重复添加", async () => {
    const cat1 = await seedCategory({ name: "源", slug: "src" });
    const cat2 = await seedCategory({ name: "目标", slug: "tgt" });
    const post = await seedContent({ title: "双标签文", slug: "dual" });
    await createRelation(post.cid, cat1.mid);
    await createRelation(post.cid, cat2.mid);

    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat1.mid}`,
      cookie, params: { id: String(cat1.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });

    const db = await getDb();
    const rels = await db.contentrelations.findMany({ where: { cid: post.cid } });
    expect(rels).toHaveLength(1);
    expect(rels[0]!.mid).toBe(cat2.mid);
  });

  test("tag 的 mid 误传 → 404(限定 type='category')", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    const keep1 = await seedCategory({ name: "keep1", slug: "k1" });
    const keep2 = await seedCategory({ name: "keep2", slug: "k2" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: tag.mid } })).not.toBeNull();
    expect(await db.metas.findUnique({ where: { mid: keep1.mid } })).not.toBeNull();
    expect(await db.metas.findUnique({ where: { mid: keep2.mid } })).not.toBeNull();
  });

  test("mid 不存在 → 404", async () => {
    await seedCategory({ name: "keep1", slug: "k1" });
    await seedCategory({ name: "keep2", slug: "k2" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: "/api/admin/categories/9999",
      cookie, params: { id: "9999" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404, message: "分类不存在" });
  });

  test("id 非整数 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: "/api/admin/categories/abc",
      cookie, params: { id: "abc" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 失败 → 403 + DB 不动", async () => {
    const cat = await seedCategory({ name: "A", slug: "a" });
    const _keep = await seedCategory({ name: "B", slug: "b" });
void _keep;
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      headers: { [CSRF_HEADER]: "wrong" },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat.mid } })).not.toBeNull();
  });

  test("未登录 → 401 + DB 不动", async () => {
    const cat = await seedCategory({ name: "A", slug: "a" });
    const _keep = await seedCategory({ name: "B", slug: "b" });
void _keep;
    await expect(callDbAdmin(handler, {
      method: "DELETE", url: `/api/admin/categories/${cat.mid}`,
      params: { id: String(cat.mid) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });

    const db = await getDb();
    expect(await db.metas.findUnique({ where: { mid: cat.mid } })).not.toBeNull();
  });
});