import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// changelogs 内存表(content 为序列化后的 JSON 串)
let rows: Array<{ id: number; content: string }> = [];
sharedFake.on("changelogs", "create", async ({ data }: { data: { content: string } }) => {
  const row = { id: rows.length + 1, content: data.content };
  rows.push(row);
  return { ...row };
});
sharedFake.on("changelogs", "findUnique", async ({ where }: { where: { id: number } }) => {
  const row = rows.find(r => r.id === where.id);
  return row ? { ...row } : null;
});
sharedFake.on("changelogs", "update", async ({ where, data }: { where: { id: number }; data: { content: string } }) => {
  const row = rows.find(r => r.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  row.content = data.content;
  return { ...row };
});
sharedFake.on("changelogs", "delete", async ({ where }: { where: { id: number } }) => {
  const i = rows.findIndex(r => r.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  rows.splice(i, 1);
  return {};
});
sharedFake.on("changelogs", "deleteMany", async ({ where }: { where: { id: { in: number[] } } }) => {
  const before = rows.length;
  rows = rows.filter(r => !where.id.in.includes(r.id));
  return { count: before - rows.length };
});

const postHandler = (await import("#server/api/admin/changelogs.post")).default;
const putHandler = (await import("#server/api/admin/changelogs/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/changelogs/[id].delete")).default;
const batchHandler = (await import("#server/api/admin/changelogs/batch-delete.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}
const entries = (type: string, value: string) => ({ content: [{ type, value }] });

beforeEach(() => {
  rows = [];
});

describe("admin/changelogs", () => {
  test("未登录 → 401;CSRF 缺失 → 403", async () => {
    await expect(callAdmin(postHandler, { body: entries("修复", "x") })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(postHandler, { cookie: session, body: entries("修复", "x") })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("POST 创建成功(content 序列化入库)", async () => {
    await callAdmin(postHandler, { cookie: await cookie(), body: { ...entries("修复", "修了个 bug"), csrfToken: CSRF_TOKEN } });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.content)[0]).toEqual({ type: "修复", value: "修了个 bug" });
  });

  test("POST 校验:空内容/超 50 条 → 400;非法类型被 normalize 规整为其他", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { ...entries("修复", ""), csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    const many = Array.from({ length: 51 }, () => ({ type: "修复", value: "v" }));
    await expect(callAdmin(postHandler, { cookie: c, body: { content: many, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });

    await callAdmin(postHandler, { cookie: c, body: { ...entries("坏类型", "x"), csrfToken: CSRF_TOKEN } });
    expect(JSON.parse(rows[0]!.content)[0].type).toBe("其他");
  });

  test("PUT 更新指定 id;404 不存在", async () => {
    const c = await cookie();
    await callAdmin(postHandler, { cookie: c, body: { ...entries("修复", "v1"), csrfToken: CSRF_TOKEN } });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "999" }, cookie: c, body: { ...entries("修复", "x"), csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
    await callAdmin(putHandler, { method: "PUT", params: { id: String(rows[0]!.id) }, cookie: c, body: { ...entries("新增", "v2"), csrfToken: CSRF_TOKEN } });
    expect(JSON.parse(rows[0]!.content)[0].type).toBe("新增");
  });

  test("DELETE 删除指定 id;batch-delete 批量删除", async () => {
    const c = await cookie();
    await callAdmin(postHandler, { cookie: c, body: { ...entries("修复", "a"), csrfToken: CSRF_TOKEN } });
    await callAdmin(postHandler, { cookie: c, body: { ...entries("修复", "b"), csrfToken: CSRF_TOKEN } });
    const ids = rows.map(r => r.id);

    await callAdmin(deleteHandler, { method: "DELETE", params: { id: String(ids[0]) }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } });
    expect(rows).toHaveLength(1);

    await callAdmin(batchHandler, { cookie: c, body: { ids: [ids[1]!], csrfToken: CSRF_TOKEN } });
    expect(rows).toHaveLength(0);
  });
});
