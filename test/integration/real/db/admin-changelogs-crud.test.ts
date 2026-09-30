/**
 * 真实 DB 集成测 —— admin/changelogs.post + [id].put + [id].delete + batch-delete
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";

import { CSRF_HEADER } from "#shared/constants";

const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const postHandler = (await import("#server/api/admin/changelogs.post")).default;
const putHandler = (await import("#server/api/admin/changelogs/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/changelogs/[id].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/changelogs/batch-delete.post")).default;

describe("admin/changelogs.post(真实 DB)", () => {
  registerDbReset();
  test("成功 → content 真实写入(归一化后 JSON 字符串)", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(postHandler, {
      method: "POST", url: "/api/admin/changelogs", cookie,
      body: {
        csrfToken: CSRF_TOKEN,
        content: [{ type: "新增", value: "功能 A" }],
      },
    }) as { success: boolean };
    expect(r.success).toBe(true);

    const db = await getDb();
    const rows = await db.changelogs.findMany({ orderBy: { id: "desc" }, take: 1 });
    expect(rows[0]!.content).toContain("功能 A");
  });

  test("content 空数组 → 400(validateChangelogData 校验)", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(postHandler, {
      method: "POST", url: "/api/admin/changelogs", cookie,
      body: { csrfToken: CSRF_TOKEN, content: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 失败 → 403 + DB 不写", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(postHandler, {
      method: "POST", url: "/api/admin/changelogs", cookie,
      body: { csrfToken: "wrong", content: [{ type: "x", value: "y" }] },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.changelogs.count()).toBe(0);
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(postHandler, {
      method: "POST", url: "/api/admin/changelogs",
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "x", value: "y" }] },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});

async function seedChangelog(content = "[]") {
  const db = await getDb();
  return db.changelogs.create({ data: { content } });
}

describe("admin/changelogs/[id].put(真实 DB)", () => {
  registerDbReset();
  test("成功 → content 真实 UPDATE(归一化后落盘)", async () => {
    const c = await seedChangelog('[{"type":"旧","value":"旧文"}]');
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(putHandler, {
      method: "PUT", url: `/api/admin/changelogs/${c.id}`,
      cookie, params: { id: String(c.id) },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "新文" }] },
    }) as { success: boolean };
    expect(r.success).toBe(true);

    const db = await getDb();
    const row = await db.changelogs.findUnique({ where: { id: c.id } });
    expect(row!.content).toContain("新文");
    expect(row!.content).not.toContain("旧文");
  });

  test("id 不存在 → 404", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: "/api/admin/changelogs/9999",
      cookie, params: { id: "9999" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "x", value: "y" }] },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("id 非整数 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: "/api/admin/changelogs/abc",
      cookie, params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "x", value: "y" }] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(putHandler, {
      method: "PUT", url: "/api/admin/changelogs/1",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "x", value: "y" }] },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("admin/changelogs/[id].delete(真实 DB)", () => {
  registerDbReset();
  test("成功 → 真实 DELETE", async () => {
    const c = await seedChangelog();
    const cookie = await loginDbCookie();
    await callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/changelogs/${c.id}`,
      cookie, params: { id: String(c.id) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    const db = await getDb();
    expect(await db.changelogs.findUnique({ where: { id: c.id } })).toBeNull();
  });

  test("id 不存在 → 404", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: "/api/admin/changelogs/9999",
      cookie, params: { id: "9999" },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("未登录 → 401 + DB 不动", async () => {
    const c = await seedChangelog();
    await expect(callDbAdmin(deleteHandler, {
      method: "DELETE", url: `/api/admin/changelogs/${c.id}`,
      params: { id: String(c.id) },
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });

    const db = await getDb();
    expect(await db.changelogs.findUnique({ where: { id: c.id } })).not.toBeNull();
  });
});

describe("admin/changelogs/batch-delete.post(真实 DB)", () => {
  registerDbReset();
  test("成功 → 批量删除指定 ids", async () => {
    const ids = await Promise.all([seedChangelog(), seedChangelog(), seedChangelog()]).then(rs => rs.map(r => r.id));
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(batchDeleteHandler, {
      method: "POST", url: "/api/admin/changelogs/batch-delete",
      cookie,
      body: { csrfToken: CSRF_TOKEN, ids: [ids[0], ids[1]] },
    }) as { success: boolean; count: number };
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);

    const db = await getDb();
    expect(await db.changelogs.count()).toBe(1); // ids[2] 还在
  });

  test("ids 空数组 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(batchDeleteHandler, {
      method: "POST", url: "/api/admin/changelogs/batch-delete", cookie,
      body: { csrfToken: CSRF_TOKEN, ids: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("ids 非数组 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(batchDeleteHandler, {
      method: "POST", url: "/api/admin/changelogs/batch-delete", cookie,
      body: { csrfToken: CSRF_TOKEN, ids: "not-array" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺 → 403", async () => {
    const ids = await Promise.all([seedChangelog(), seedChangelog()]).then(rs => rs.map(r => r.id));
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(batchDeleteHandler, {
      method: "POST", url: "/api/admin/changelogs/batch-delete", cookie,
      body: { ids },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.changelogs.count()).toBe(2);
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(batchDeleteHandler, {
      method: "POST", url: "/api/admin/changelogs/batch-delete",
      body: { csrfToken: CSRF_TOKEN, ids: [1] },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});