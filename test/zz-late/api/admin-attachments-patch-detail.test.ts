import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/attachments/[id].patch")).default;

describe("admin/attachments/[id].patch 边界补测", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
      cookie: "csrf_token=" + CSRF_TOKEN,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie,
      params: { id: "1" },
      body: { name: "x" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 非正整数 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "abc" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("附件不存在 → 404", async () => {
    sharedFake.on("attachments", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, name: "x" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("cids 非数组 → 400", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({ aid: 1, name: "x", type: "image", url: "/u", storage: "local", metadata: {} }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, cids: "1,2,3" },
    })).rejects.toThrow(/cids 格式错误/);
  });

  test("cids 含非正整数 → 400(不静默清空)", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({ aid: 1, name: "x", type: "image", url: "/u", storage: "local", metadata: {} }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, cids: [1, -2] },
    })).rejects.toThrow(/cids 格式错误/);
  });

  test("成功 → 更新附件元数据 + 关联文章", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({ aid: 1, name: "旧名", type: "image", url: "/u", storage: "local", metadata: {} }));
    sharedFake.on("attachments", "update", async () => ({}));
    sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("contentattachments", "createMany", async () => ({ count: 0 }));
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, name: "新名", cids: [1, 2] },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("createMany P2003(关联到不存在 content)→ 400", async () => {
    sharedFake.on("attachments", "findUnique", async () => ({ aid: 1, name: "x", type: "image", url: "/u", storage: "local", metadata: {} }));
    sharedFake.on("attachments", "update", async () => ({}));
    sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
    sharedFake.on("contentattachments", "createMany", async () => {
      throw Object.assign(new Error("FK"), { code: "P2003" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, cids: [999] },
    })).rejects.toThrow(/存在无效的关联内容/);
  });
});