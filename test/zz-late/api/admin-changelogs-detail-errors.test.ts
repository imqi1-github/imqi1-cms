import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const changelogsPost = (await import("#server/api/admin/changelogs.post")).default;
const changelogsPut = (await import("#server/api/admin/changelogs/[id].put")).default;
const changelogsDelete = (await import("#server/api/admin/changelogs/[id].delete")).default;

describe("admin/changelogs.post 错误路径", () => {
  test("content 非数组 → 400(normalizeChangelogEntries 返回空 → 长度 0)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: "[]" }, // 字符串而不是数组 → normalize 返回空
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("content 空数组 → 400(validateChangelogData 要求 ≥1)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("create 异常(已被 handle 抛 P2025 模拟) → 500", async () => {
    // changelogs.post 没有 try/catch,所以异常直接抛;Prisma P2025 等会变 500
    sharedFake.on("changelogs", "create", async () => { throw new Error("db boom"); });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPost, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    })).rejects.toBeDefined();
  });
});

describe("admin/changelogs/[id].put 错误路径", () => {
  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, content: [{ type: "修复", value: "x" }] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("body 缺省 → 视作空 body → CSRF 失败 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: undefined,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("content 空数组 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsPut, {
      method: "PUT",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, content: [] },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/changelogs/[id].delete 错误路径", () => {
  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "-1" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsDelete, {
      method: "DELETE",
      cookie,
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("changelog 不存在 → 500(P2025 由 handler 内 catch 处理;prisma 直接抛也走 500)", async () => {
    sharedFake.on("changelogs", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(changelogsDelete, {
      method: "DELETE",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      headers: { "x-csrf-token": CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});