import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface SubRow { id: number; name: string; url: string; avatar: string | null; lastUpdated: Date }
let rows: SubRow[] = [];
sharedFake.on("subscribes", "create", async ({ data }: { data: Omit<SubRow, "id" | "lastUpdated"> }) => {
  const row: SubRow = { id: rows.length + 100, lastUpdated: new Date(), ...data };
  rows.push(row);
  return { id: row.id, url: row.url, name: row.name, avatar: row.avatar, lastUpdated: row.lastUpdated };
});
sharedFake.on("subscribes", "findMany", async () => rows.map(r => ({ ...r })));
sharedFake.on("subscribes", "update", async ({ where, data }: { where: { id: number }; data: Partial<SubRow> }) => {
  const row = rows.find(r => r.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  return { ...row };
});
sharedFake.on("subscribes", "delete", async ({ where }: { where: { id: number } }) => {
  const i = rows.findIndex(r => r.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  rows.splice(i, 1);
  return {};
});

const getHandler = (await import("#server/api/admin/subscribes.get")).default;
const postHandler = (await import("#server/api/admin/subscribes.post")).default;
const putHandler = (await import("#server/api/admin/subscribes/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/subscribes/[id].delete")).default;

beforeEach(() => {
  rows = [{ id: 1, name: "旧订阅", url: "https://old.com/feed", avatar: null, lastUpdated: new Date() }];
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/subscribes", () => {
  test("未登录 → 401;CSRF 缺失 → 403", async () => {
    await expect(callAdmin(getHandler, {})).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(postHandler, { cookie: session, body: { name: "x", url: "https://x.com" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("POST:name/url 必填 → 400;成功返回白名单字段", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { name: "", url: "https://x.com", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(postHandler, { cookie: c, body: { name: "x", url: "", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });

    const created = (await callAdmin(postHandler, { cookie: c, body: { name: "新订阅", url: "https://new.com/feed", avatar: "/a.png", csrfToken: CSRF_TOKEN } })) as Record<string, unknown>;
    expect(created).toMatchObject({ name: "新订阅", url: "https://new.com/feed" });
    expect(Object.keys(created).sort()).toEqual(["avatar", "id", "lastUpdated", "name", "url"]);
  });

  test("PUT:更新成功;404 不存在", async () => {
    const c = await cookie();
    const updated = (await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { name: "改名", url: "https://new.com/feed", csrfToken: CSRF_TOKEN } })) as Record<string, unknown>;
    expect(updated).toMatchObject({ id: 1, name: "改名" });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "999" }, cookie: c, body: { name: "x", url: "https://x.com", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("DELETE:成功;重复删除 → 404", async () => {
    const c = await cookie();
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).resolves.toBeTruthy();
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });
});
