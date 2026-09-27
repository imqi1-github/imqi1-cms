/**
 * admin/links.post 补测:
 *  - 401/CSRF/400 守卫
 *  - name/link 必填非空 → 400
 *  - name/link 非字符串 → 400
 *  - link 是 javascript:/data: → 400(XSS 拦截)
 *  - link 无协议 → ensureUrlProtocol 补 https://
 *  - 字段长度上限
 *  - 成功创建 → 返回 select 白名单字段
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/links.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callPost(opts: { body?: Record<string, unknown>; cookie?: string }) {
  return callAdmin(handler, {
    method: "POST",
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/links.post 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callPost({ cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      body: { name: "x", link: "https://x.com" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin/links.post 必填与类型", () => {
  test("name 缺省 → 400", async () => {
    await expect(callPost({ body: { link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 缺省 → 400", async () => {
    await expect(callPost({ body: { name: "x" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非字符串 → 400", async () => {
    await expect(callPost({ body: { name: 123, link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 非字符串 → 400", async () => {
    await expect(callPost({ body: { name: "x", link: ["x"] } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 空字符串/纯空白 → 400", async () => {
    await expect(callPost({ body: { name: "", link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callPost({ body: { name: "   ", link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 超 100 字符 → 400", async () => {
    await expect(callPost({ body: { name: "n".repeat(101), link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 超 191 字符 → 400", async () => {
    await expect(callPost({ body: { name: "x", link: "https://x.com/" + "a".repeat(200) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/links.post XSS 拦截", () => {
  test("link 是 javascript: → 400", async () => {
    await expect(callPost({ body: { name: "x", link: "javascript:alert(1)" } })).rejects.toMatchObject({ statusCode: 400, message: "仅支持 http/https 链接" });
  });

  test("link 是 data:text → 400", async () => {
    await expect(callPost({ body: { name: "x", link: "data:text/html,<script>alert(1)</script>" } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("link 是 ftp: → 400", async () => {
    await expect(callPost({ body: { name: "x", link: "ftp://files.example.com/x" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/links.post 业务逻辑", () => {
  test("成功 → 返回 select 白名单字段(id/name/link/desc/avatar/enabled)", async () => {
    sharedFake.on("links", "create", async () => ({ id: 100, name: "新友链", link: "https://x.com", desc: null, avatar: null, enabled: true }));
    const r = (await callPost({ body: { name: "新友链", link: "https://x.com" } })) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["avatar", "desc", "enabled", "id", "link", "name"]);
    expect(r.enabled).toBe(true); // 新友链默认启用
  });

  test("link 无协议 → ensureUrlProtocol 补 https://", async () => {
    let captured: { link: string } | null = null;
    sharedFake.on("links", "create", async ({ data }: { data: { link: string } }) => {
      captured = { link: data.link };
      return { id: 1, name: "x", link: data.link, desc: null, avatar: null, enabled: true };
    });
    await callPost({ body: { name: "x", link: "example.com/path" } });
    expect(captured!.link.startsWith("https://")).toBe(true);
  });

  test("link 已是 https → 原样透传", async () => {
    let captured: { link: string } | null = null;
    sharedFake.on("links", "create", async ({ data }: { data: { link: string } }) => {
      captured = { link: data.link };
      return { id: 1, name: "x", link: data.link, desc: null, avatar: null, enabled: true };
    });
    await callPost({ body: { name: "x", link: "https://example.com" } });
    expect(captured!.link).toBe("https://example.com");
  });
});