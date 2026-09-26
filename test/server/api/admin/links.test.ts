import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// links 内存表
interface LinkRow { id: number; name: string; link: string; desc: string | null; avatar: string | null; enabled: boolean }
let links: LinkRow[] = [];
const INITIAL_LINKS: LinkRow[] = [
  { id: 1, name: "友链甲", link: "https://a.com", desc: "甲", avatar: null, enabled: true },
  { id: 2, name: "友链乙", link: "https://b.com", desc: null, avatar: null, enabled: false },
];
const prismaError = (code: string) => Object.assign(new Error(code), { code });

sharedFake.on("links", "create", async ({ data }: { data: Omit<LinkRow, "id"> }) => {
  const row = { id: links.length + 100, ...data, enabled: true } as LinkRow;
  links.push(row);
  return row;
});
sharedFake.on("links", "findMany", async () => links.map(l => ({ ...l })));
sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) => {
  const row = links.find(l => l.id === where.id);
  return row ? { ...row } : null;
});
sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Partial<LinkRow> }) => {
  const row = links.find(l => l.id === where.id);
  if (!row) throw prismaError("P2025");
  Object.assign(row, data);
  return { ...row };
});
sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
  const i = links.findIndex(l => l.id === where.id);
  if (i === -1) throw prismaError("P2025");
  links.splice(i, 1);
  return {};
});
sharedFake.on("links", "updateMany", async ({ where, data }: { where: { id: number; enabled?: boolean }; data: Partial<LinkRow> }) => {
  let count = 0;
  for (const l of links) {
    if (l.id === where.id && (where.enabled === undefined || l.enabled === where.enabled)) {
      Object.assign(l, data);
      count++;
    }
  }
  return { count };
});

const getLinks = (await import("#server/api/admin/links.get")).default;
const createLink = (await import("#server/api/admin/links.post")).default;
const patchLink = (await import("#server/api/admin/links/[id].patch")).default;
const toggleLink = (await import("#server/api/admin/links/[id]/toggle.patch")).default;
const deleteLink = (await import("#server/api/admin/links/[id].delete")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/links", () => {
  beforeEach(() => {
    links = INITIAL_LINKS.map(l => ({ ...l }));
  });

  test("GET 列表返回全部字段(后台可见内部状态)", async () => {
    const list = (await callAdmin(getLinks, { method: "GET", cookie: await loginSessionCookie() })) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(2);
    expect(list[0]!).toHaveProperty("enabled");
  });

  test("POST:四层防线(name/link 必填 400、javascript: 400、CSRF 403、401)", async () => {
    await expect(callAdmin(createLink, {})).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(createLink, { cookie: session, body: { name: "x", link: "https://x.com" } })).rejects.toMatchObject({ statusCode: 403 });
    const c = await cookie();
    await expect(callAdmin(createLink, { cookie: c, body: { name: "", link: "https://x.com", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(createLink, { cookie: c, body: { name: "恶", link: "javascript:alert(1)", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("POST 成功:裸域名补 https,返回白名单字段", async () => {
    const created = await callAdmin(createLink, { cookie: await cookie(), body: { name: "新友链", link: "example.com", desc: "d", csrfToken: CSRF_TOKEN } }) as Record<string, unknown>;
    expect(created).toMatchObject({ name: "新友链", link: "https://example.com", enabled: true });
    expect(Object.keys(created).sort()).toEqual(["avatar", "desc", "enabled", "id", "link", "name"]);
  });

  test("PATCH:改名成功;enabled 非布尔 → 400;不存在 → 404", async () => {
    const c = await cookie();
    const patched = await callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "甲改", csrfToken: CSRF_TOKEN } }) as Record<string, unknown>;
    expect(patched).toMatchObject({ id: 1, name: "甲改" });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { enabled: "yes", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "999" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("toggle:翻转 enabled;404 不存在(单端登录:一次登录全程复用)", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    const before = (await callAdmin(getLinks, { method: "GET", cookie: session })) as Array<{ id: number; enabled: boolean }>;
    const first = before.find(l => l.id === 1)!;
    const toggled = await callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN } }) as Record<string, unknown>;
    expect(toggled.enabled).toBe(!first.enabled);
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "999" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("DELETE:成功后重复删除 P2025 → 404", async () => {
    const c = await cookie();
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, cookie: c })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).resolves.toBeTruthy();
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("admin/links 分支补测", () => {
  // 文件级 beforeEach 在 describe 外,补测内的抛错替身需自行复位
  beforeEach(() => { links = INITIAL_LINKS.map(l => ({ ...l })); });

  test("toggle:401/400/403 前置校验;并发覆盖 → 409", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "abc" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, cookie: session, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "999" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });

    // updateMany 命中 0 行但行仍存在 → 409 提示刷新
    sharedFake.on("links", "updateMany", async () => ({ count: 0 }));
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 409 });
    // 行在 updateMany 与复查之间被删 → 404
    sharedFake.on("links", "findUnique", async () => null);
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("toggle:未知异常 → 500", async () => {
    const c = await cookie();
    sharedFake.on("links", "findUnique", async () => { throw new Error("db down"); });
    await expect(callAdmin(toggleLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
  });
});

// 分支补测里的抛错替身会覆盖共享 handler 表,用完显式恢复
function restoreLinkFakes(): void {
  sharedFake.on("links", "create", async ({ data }: { data: Omit<LinkRow, "id"> }) => {
    const row = { id: links.length + 100, ...data, enabled: true } as LinkRow;
    links.push(row);
    return row;
  });
  sharedFake.on("links", "findMany", async () => links.map(l => ({ ...l })));
  sharedFake.on("links", "findUnique", async ({ where }: { where: { id: number } }) => {
    const row = links.find(l => l.id === where.id);
    return row ? { ...row } : null;
  });
  sharedFake.on("links", "update", async ({ where, data }: { where: { id: number }; data: Partial<LinkRow> }) => {
    const row = links.find(l => l.id === where.id);
    if (!row) throw prismaError("P2025");
    Object.assign(row, data);
    return { ...row };
  });
  sharedFake.on("links", "delete", async ({ where }: { where: { id: number } }) => {
    const i = links.findIndex(l => l.id === where.id);
    if (i === -1) throw prismaError("P2025");
    links.splice(i, 1);
    return {};
  });
  sharedFake.on("links", "updateMany", async ({ where, data }: { where: { id: number; enabled?: boolean }; data: Partial<LinkRow> }) => {
    let count = 0;
    for (const l of links) {
      if (l.id === where.id && (where.enabled === undefined || l.enabled === where.enabled)) {
        Object.assign(l, data);
        count++;
      }
    }
    return { count };
  });
}

describe("admin/links 分支补测 2", () => {
  beforeEach(() => {
    links = INITIAL_LINKS.map(l => ({ ...l }));
    restoreLinkFakes();
  });

  test("GET:401;DB 异常 → 500", async () => {
    await expect(callAdmin(getLinks, {})).rejects.toMatchObject({ statusCode: 401 });
    sharedFake.on("links", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(getLinks, { method: "GET", cookie: await loginSessionCookie() })).rejects.toMatchObject({ statusCode: 500 });
    restoreLinkFakes();
  });

  test("PATCH:401/400/403/404 前置校验", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "abc" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: session, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "999" }, cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("PATCH:协议/类型校验 → 400(javascript:、enabled/name/link/desc/avatar 非字符串)", async () => {
    const c = await cookie();
    const patch = (body: unknown) => callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, ...(body as object) } });
    await expect(patch({ link: "javascript:alert(1)" })).rejects.toMatchObject({ statusCode: 400, message: "仅支持 http/https 链接" });
    await expect(patch({ link: "data:text/html,x" })).rejects.toMatchObject({ statusCode: 400, message: "仅支持 http/https 链接" });
    await expect(patch({ enabled: "yes" })).rejects.toMatchObject({ statusCode: 400, message: "enabled 必须为布尔值" });
    await expect(patch({ name: 5 })).rejects.toMatchObject({ statusCode: 400, message: "name 必须为字符串" });
    await expect(patch({ link: 5 })).rejects.toMatchObject({ statusCode: 400, message: "link 必须为字符串" });
    await expect(patch({ desc: 5 })).rejects.toMatchObject({ statusCode: 400, message: "desc 必须为字符串" });
    await expect(patch({ avatar: 5 })).rejects.toMatchObject({ statusCode: 400, message: "avatar 必须为字符串" });
  });

  test("PATCH:裸域名补 https;成功返回白名单字段;P2025 → 404;未知 → 500", async () => {
    const c = await cookie();
    const r = (await callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, link: "newdomain.com", name: "改名", enabled: false } })) as Record<string, unknown>;
    expect(r).toMatchObject({ id: 1, name: "改名", link: "https://newdomain.com", enabled: false });
    expect(r.isModification).toBeUndefined();

    sharedFake.on("links", "update", async () => { throw Object.assign(new Error("P2025"), { code: "P2025" }); });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "x" } })).rejects.toMatchObject({ statusCode: 404 });

    restoreLinkFakes();
    sharedFake.on("links", "update", async () => { throw new Error("db down"); });
    await expect(callAdmin(patchLink, { method: "PATCH", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "x" } })).rejects.toMatchObject({ statusCode: 500 });
    restoreLinkFakes();
  });

  test("DELETE:401/400/403/404/500", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, headers: h })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "abc" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, cookie: session, headers: h })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "999" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 404 });

    sharedFake.on("links", "delete", async () => { throw new Error("db down"); });
    await expect(callAdmin(deleteLink, { method: "DELETE", params: { id: "1" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 500 });
    restoreLinkFakes();
  });

  test("POST:401/400(javascript:)/500", async () => {
    await expect(callAdmin(createLink, { body: { name: "x", link: "https://x.com", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    const c = await cookie();
    await expect(callAdmin(createLink, { cookie: c, body: { name: "x", link: "javascript:alert(1)", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });

    sharedFake.on("links", "create", async () => { throw new Error("db down"); });
    await expect(callAdmin(createLink, { cookie: c, body: { name: "x", link: "https://x.com", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
    restoreLinkFakes();
  });
});
