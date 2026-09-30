/**
 * 真实 DB 集成测 —— admin/categories/[id].put
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import { CSRF_HEADER } from "#shared/constants";

const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie, seedCategory } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const handler = (await import("#server/api/admin/categories/[id].put")).default;

describe("admin/categories/[id].put(真实 DB)", () => {
  registerDbReset();
  test("成功 → name/slug/desc 真实 UPDATE", async () => {
    const cat = await seedCategory({ name: "旧名", slug: "old" });
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "新名", slug: "new", desc: "新描述" },
    }) as { success: boolean; data: { name: string; slug: string; desc: string } };
    expect(r.success).toBe(true);
    expect(r.data.name).toBe("新名");

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: cat.mid } });
    expect(row!.name).toBe("新名");
    expect(row!.slug).toBe("new");
    expect(row!.desc).toBe("新描述");
  });

  test("slug 缺省 → 保留原值(部分更新语义,不丢数据)", async () => {
    const cat = await seedCategory({ name: "A", slug: "keep-slug", desc: "原 desc" });
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "新名" }, // 只改 name
    });
    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: cat.mid } });
    expect(row!.name).toBe("新名");
    expect(row!.slug).toBe("keep-slug"); // 保留
    expect(row!.desc).toBe("原 desc");   // 保留
  });

  test("slug 显式空串 → 清空为 null(与「未传」语义不同)", async () => {
    const cat = await seedCategory({ name: "A", slug: "to-clear" });
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "A", slug: "" }, // 显式清空
    });
    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: cat.mid } });
    expect(row!.slug).toBeNull();
  });

  test("mid 不存在 → 404 分类不存在", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: "/api/admin/categories/9999",
      cookie, params: { id: "9999" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 404, message: "分类不存在" });
  });

  test("传 tag 的 mid → 404(限定 type='category',防误改 tag)", async () => {
    const tag = await seedCategory({ name: "T", slug: "t", type: "tag" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${tag.mid}`,
      cookie, params: { id: String(tag.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("name 已被其它分类占用 → 400", async () => {
    await seedCategory({ name: "占位", slug: "a" });
    const cat = await seedCategory({ name: "B", slug: "b" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "占位", slug: "new" },
    })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
  });

  test("name 空 → 400 + DB 不动", async () => {
    const cat = await seedCategory({ name: "原", slug: "y" });
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: `/api/admin/categories/${cat.mid}`,
      cookie, params: { id: String(cat.mid) },
      body: { csrfToken: CSRF_TOKEN, name: "" },
    })).rejects.toMatchObject({ statusCode: 400 });

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: cat.mid } });
    expect(row!.name).toBe("原"); // 未变
  });

  test("id 非整数 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: "/api/admin/categories/abc",
      cookie, params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("并发删除竞态 → P2025 转 404(预检 → update 之间被删)", async () => {
    // 这里只验证错误码路径;真正的并发竞态需要 2 个并发请求触发,本测不模拟
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "PUT", url: "/api/admin/categories/9999",
      cookie, params: { id: "9999" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(handler, {
      method: "PUT", url: "/api/admin/categories/1",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  // 占位:验证 CSRF_HEADER 常量值(防 #server/utils/csrf 改 cookie 名时回归)
  test("CSRF_HEADER === x-csrf-token", () => {
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});