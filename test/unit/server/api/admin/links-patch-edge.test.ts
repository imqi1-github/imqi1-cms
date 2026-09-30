/**
 * admin/links/[id].patch 补测:
 *  - 401/CSRF/400 守卫
 *  - 类型校验:非字符串 name/link/desc/avatar → 400
 *  - enabled 非布尔 → 400
 *  - link javascript:/data: 等非 http(s) 协议 → 400(防存储型 XSS)
 *  - 链接不存在 → 404
 *  - 响应含 select 白名单字段(id/name/link/desc/avatar/enabled)
 *  - 字段长度上限校验
 *  - 并发删除(P2025)→ 404
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/links/[id].patch")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callPatch(opts: { id?: string; body?: Record<string, unknown>; cookie?: string }) {
  const params: Record<string, string> = {};
  if (opts.id !== undefined) params.id = opts.id;
  return callAdmin(handler, {
    method: "PUT",
    params,
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/links/[id].patch 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callPatch({ id: "1", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "x" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 缺省 → 400", async () => {
    await expect(callPatch({})).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 非正整数 → 400", async () => {
    for (const bad of ["0", "-1", "abc"]) {
      await expect(callPatch({ id: bad })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("admin/links/[id].patch 类型与协议校验", () => {
  test("name 非字符串 → 400", async () => {
    await expect(callPatch({ id: "1", body: { name: 123 } })).rejects.toMatchObject({ statusCode: 400, message: "name 必须为字符串" });
  });

  test("link 非字符串 → 400", async () => {
    await expect(callPatch({ id: "1", body: { link: ["x"] } })).rejects.toMatchObject({ statusCode: 400, message: "link 必须为字符串" });
  });

  test("desc 非字符串 → 400", async () => {
    await expect(callPatch({ id: "1", body: { desc: 999 } })).rejects.toMatchObject({ statusCode: 400, message: "desc 必须为字符串" });
  });

  test("avatar 非字符串 → 400", async () => {
    await expect(callPatch({ id: "1", body: { avatar: true } })).rejects.toMatchObject({ statusCode: 400, message: "avatar 必须为字符串" });
  });

  test("enabled 非布尔 → 400(数字/字符串)", async () => {
    for (const bad of [0, 1, "true", "yes", null]) {
      await expect(callPatch({ id: "1", body: { enabled: bad } })).rejects.toMatchObject({ statusCode: 400, message: "enabled 必须为布尔值" });
    }
  });

  test("link 是 javascript: → 400(XSS 拦截)", async () => {
    await expect(callPatch({ id: "1", body: { link: "javascript:alert(1)" } })).rejects.toMatchObject({ statusCode: 400, message: "仅支持 http/https 链接" });
  });

  test("link 是 data:text → 400(XSS 拦截)", async () => {
    await expect(callPatch({ id: "1", body: { link: "data:text/html,<script>alert(1)</script>" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 无协议 → ensureUrlProtocol 自动补 https://", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "旧名" }));
    sharedFake.on("links", "update", async ({ data }: { data: { link?: string } }) => ({ id: 1, name: "x", ...data }));
    const r = (await callPatch({ id: "1", body: { link: "example.com/path" } })) as Record<string, unknown>;
    expect(r.link).toContain("https://");
  });

  test("name 超长(>100)→ 400", async () => {
    await expect(callPatch({ id: "1", body: { name: "n".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/links/[id].patch 业务逻辑", () => {
  test("链接不存在 → 404", async () => {
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callPatch({ id: "999", body: { name: "x" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功 → 返回 select 白名单字段", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "旧名" }));
    sharedFake.on("links", "update", async () => ({ id: 1, name: "新名", link: "https://x.com", desc: null, avatar: null, enabled: true }));
    const r = (await callPatch({ id: "1", body: { name: "新名" } })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["avatar", "desc", "enabled", "id", "link", "name"]);
  });
});

describe("admin/links/[id].patch:并发兜底", () => {
  test("update 时链接被并发删(P2025)→ 404 而非 500", async () => {
    sharedFake.on("links", "findUnique", async () => ({ id: 1, name: "x" }));
    sharedFake.on("links", "update", async () => {
      throw Object.assign(new Error("not found"), { code: "P2025" });
    });
    await expect(callPatch({ id: "1", body: { name: "新名" } })).rejects.toMatchObject({ statusCode: 404 });
  });
});