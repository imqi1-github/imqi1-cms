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
