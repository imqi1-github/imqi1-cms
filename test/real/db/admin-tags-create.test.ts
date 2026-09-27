/**
 * 真实 DB 集成测 —— admin/tags.post
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
const handler = (await import("#server/api/admin/tags.post")).default;

describe("admin/tags.post(真实 DB)", () => {
  registerDbReset();
  test("成功 → metas 表写入 type='tag'", async () => {
    const cookie = await loginDbCookie();
    const r = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags",
      cookie,
      body: { csrfToken: CSRF_TOKEN, name: "JS", slug: "js", desc: "JS 笔记" },
    }) as { mid: number; name: string; slug: string; type: string };

    expect(r.name).toBe("JS");
    expect(r.type).toBe("tag");

    const db = await getDb();
    const row = await db.metas.findUnique({ where: { mid: r.mid } });
    expect(row!.type).toBe("tag");
    expect(row!.slug).toBe("js");
  });

  test("name 空 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "  " },
    })).rejects.toMatchObject({ statusCode: 400, message: "标签名称不能为空" });
  });

  test("name 非字符串 → 400", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: 123 },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 重名 → 400 P2002 转 标签名称或标识已存在", async () => {
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "dup" },
    });
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "dup", slug: "other" },
    })).rejects.toMatchObject({ statusCode: 400, message: "标签名称或标识(slug)已存在" });
  });

  test("slug 重名 → 400", async () => {
    const cookie = await loginDbCookie();
    await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "A", slug: "dup-slug" },
    });
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "B", slug: "dup-slug" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 空串/null/undefined → DB 中 slug 为 null", async () => {
    const cookie = await loginDbCookie();
    const r1 = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "A", slug: "" },
    }) as { mid: number };
    const r2 = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "B", slug: null },
    }) as { mid: number };
    const r3 = await callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: CSRF_TOKEN, name: "C" },
    }) as { mid: number };
    const db = await getDb();
    for (const mid of [r1.mid, r2.mid, r3.mid]) {
      const row = await db.metas.findUnique({ where: { mid } });
      expect(row!.slug).toBeNull();
    }
  });

  test("CSRF 失败 → 403", async () => {
    const cookie = await loginDbCookie();
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags", cookie,
      body: { csrfToken: "wrong", name: "x" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("未登录 → 401", async () => {
    await expect(callDbAdmin(handler, {
      method: "POST", url: "/api/admin/tags",
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  // 占位:CSRF_HEADER 在 tag handler 里是必要的(其它 meta 路由把 csrf 走 header)
  test("CSRF_HEADER === x-csrf-token", () => {
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});