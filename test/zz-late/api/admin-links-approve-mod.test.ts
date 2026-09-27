import { describe, expect, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const handler = (await import("#server/api/admin/links/[id]/approve-modification.patch")).default;

describe("admin/links/[id]/approve-modification.patch(友链修改申请审批)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, {
      method: "PATCH",
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("id 缺省/非法 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "0" },
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("CSRF 缺失 → 403", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie,
      params: { id: "1" },
      body: { action: "approve" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("action 非法值 → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, action: "invalid" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("修改请求不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "999" },
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("非修改申请(isModification=false)→ 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, isModification: false, originalLinkId: null }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("缺少 originalLinkId → 400", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, isModification: true, originalLinkId: null }));
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "1" },
      body: { csrfToken: CSRF_TOKEN, action: "approve" },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("reject 成功 → 删除修改请求", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 2, name: "x", link: "https://x.com", desc: null, avatar: null,
      isModification: true, originalLinkId: 11,
    }));
    let deleted = false;
    sharedFake.on("links", "delete", async () => { deleted = true; return {}; });
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "2" },
      body: { csrfToken: CSRF_TOKEN, action: "reject" },
    }) as { success: boolean; message: string };
    expect(r.success).toBe(true);
    expect(String(r.message)).toContain("已拒绝");
    expect(deleted).toBe(true);
  });

  test("reject 时修改请求被并发删 → P2025 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => ({
      id: 4, name: "x", link: "https://x.com", desc: null, avatar: null,
      isModification: true, originalLinkId: 12,
    }));
    sharedFake.on("links", "delete", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PATCH",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      params: { id: "4" },
      body: { csrfToken: CSRF_TOKEN, action: "reject" },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});