/**
 * 真实 DB 集成测 —— admin/contents.post(创建文章)
 */
import { describe, expect, test } from "bun:test";

import { setupTestEnv } from "./_setup";


const CSRF_TOKEN = "test-csrf-token-1234567890";

await setupTestEnv();
await import("#test/helpers/nitro-globals");
const { getDb, callDbAdmin, loginDbCookie } = await import("./_helpers");
const { registerDbReset } = await import("./_helpers");
void registerDbReset;
const handler = (await import("#server/api/admin/contents.post")).default;

describe("admin/contents.post(真实 DB)", () => {
  registerDbReset();
  test("成功 → contents 写入 + 返回 cid(白名单)", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents",
      cookie,
      body: {
        csrfToken: CSRF_TOKEN,
        title: "新文章",
        slug: "new-post",
        content: "正文内容",
        status: 1,
        type: 0,
      },
    }) as { success: boolean; data: { cid: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBeGreaterThan(0);

    const db = await getDb();
    const row = await db.contents.findUnique({ where: { cid: r.data.cid } });
    expect(row!.title).toBe("新文章");
    expect(row!.slug).toBe("new-post");
    expect(row!.status).toBe(1);
    expect(row!.type).toBe(0);
    expect(row!.uid).toBe(1); // admin
  });

  test("不传 slug → 落盘为 cid(回填逻辑)", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: "无 slug", content: "x", status: 1, type: 0 },
    }) as { data: { cid: number } };
    const db = await getDb();
    const row = await db.contents.findUnique({ where: { cid: r.data.cid } });
    expect(row!.slug).toBe(String(r.data.cid));
  });

  test("缺 title → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, content: "x", status: 1, type: 0 },
    })).rejects.toMatchObject({ statusCode: 400, message: "标题不能为空" });
  });

  test("title 非字符串 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: 123, status: 1, type: 0 },
    })).rejects.toMatchObject({ statusCode: 400, message: "标题格式错误" });
  });

  test("status 非法(2)→ 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: "x", status: 2, type: 0 },
    })).rejects.toMatchObject({ statusCode: 400, message: "状态无效" });
  });

  test("type 非法(2)→ 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: "x", status: 1, type: 2 },
    })).rejects.toMatchObject({ statusCode: 400, message: "类型无效" });
  });

  test("slug 重名 → 400", async () => {
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: "A", slug: "dup", status: 1, type: 0 },
    });
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: CSRF_TOKEN, title: "B", slug: "dup", status: 1, type: 0 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 失败 → 403 + DB 不写", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents", cookie,
      body: { csrfToken: "wrong", title: "x", slug: "x", status: 1, type: 0 },
    })).rejects.toMatchObject({ statusCode: 403 });

    const db = await getDb();
    expect(await db.contents.count()).toBe(0);
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/contents",
      body: { csrfToken: CSRF_TOKEN, title: "x", slug: "x", status: 1, type: 0 },
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});