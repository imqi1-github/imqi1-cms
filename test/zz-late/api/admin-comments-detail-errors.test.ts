import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const deleteHandler = (await import("#server/api/admin/comments/[id].delete")).default;
const patchHandler = (await import("#server/api/admin/comments/[id].patch")).default;

describe("admin/comments/[id].delete 错误路径", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie,
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("评论不存在(预检)→ 404", async () => {
    sharedFake.on("comments", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 删除 + 失效缓存", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("contents", "update", async () => ({}));
    sharedFake.on("comments", "delete", async () => ({}));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("admin/comments/[id].patch 错误路径", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "x" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      body: { csrfToken: CSRF_TOKEN, content: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(patchHandler, {
      method: "PATCH",
      cookie,
      params: { id: "1" },
      body: { content: "x" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功 → 仅更新 content(状态不变 → 不动计数)", async () => {
    sharedFake.on("comments", "findUnique", async () => ({ coid: 1, cid: 10, status: 1 }));
    sharedFake.on("comments", "update", async ({ data }: { data: { content?: string } }) =>
      ({ coid: 1, cid: 10, status: 1, name: "x", link: null, content: data.content ?? "y", create_time: new Date(), parent_id: null, content_ref: null }));
    let counterUpdates = 0;
    sharedFake.on("contents", "update", async () => { counterUpdates++; return {}; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(patchHandler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: "新内容" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(counterUpdates).toBe(0);
  });
});