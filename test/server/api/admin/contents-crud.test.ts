import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
// deleteOrphanAttachments 由 attachment-cleanup.test 的 mock 注册,此处依赖已注册的 attachments 假件
mock.module("#server/utils/attachment-cleanup", () => ({
  deleteOrphanAttachments: async () => 0,
}));

interface ContentRow {
  cid: number; title: string; slug: string | null; desc: string | null; content: string | null;
  status: number; type: number; comment_num: number; uid: number; create_time: Date; update_time: Date;
}
let contents: ContentRow[] = [];
const deletedCids: number[] = [];

sharedFake.on("contents", "findMany", async () => contents.map(c => ({ ...c })));
sharedFake.on("contents", "count", async () => contents.length);
sharedFake.on("contents", "findFirst", async ({ where }: { where: { slug?: string; type?: number; cid?: { not: number } | undefined } }) => {
  const row = contents.find(c =>
    c.slug === where.slug && c.type === where.type && (!where.cid || c.cid !== (where.cid as { not: number }).not));
  return row ? { ...row } : null;
});
sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) => {
  const row = contents.find(c => c.cid === where.cid);
  return row ? { ...row } : null;
});
sharedFake.on("contents", "create", async ({ data }: { data: Partial<ContentRow> }) => {
  const row: ContentRow = {
    cid: contents.length + 100,
    title: data.title ?? "", slug: data.slug ?? null, desc: data.desc ?? null,
    content: data.content ?? null, status: data.status ?? 1, type: data.type ?? 0,
    comment_num: 0, uid: data.uid ?? 1, create_time: new Date(), update_time: new Date(),
  };
  contents.push(row);
  return { ...row };
});
sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: Partial<ContentRow> }) => {
  const row = contents.find(c => c.cid === where.cid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  return { ...row };
});
sharedFake.on("contents", "delete", async ({ where }: { where: { cid: number } }) => {
  const i = contents.findIndex(c => c.cid === where.cid);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  deletedCids.push(where.cid);
  contents.splice(i, 1);
  return {};
});
sharedFake.on("contents", "deleteMany", async ({ where }: { where: { cid: { in: number[] } } }) => {
  const before = contents.length;
  contents = contents.filter(c => !where.cid.in.includes(c.cid));
  deletedCids.push(...where.cid.in.filter(cid => !contents.some(c => c.cid === cid)));
  return { count: before - contents.length };
});
sharedFake.on("contentattachments", "findMany", async () => []);
sharedFake.on("contentattachments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("contentrelations", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("comments", "deleteMany", async () => ({ count: 0 }));
sharedFake.on("$transaction", async (opsOrFn: unknown) =>
  typeof opsOrFn === "function" ? await (opsOrFn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma) : opsOrFn);

const getHandler = (await import("#server/api/admin/contents.get")).default;
const getOneHandler = (await import("#server/api/admin/contents/[cid].get")).default;
const putHandler = (await import("#server/api/admin/contents/[cid].put")).default;
const deleteOneHandler = (await import("#server/api/admin/contents/[cid].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/contents/batch-delete.post")).default;

beforeEach(() => {
  contents = [
    { cid: 10, title: "已有文章", slug: "exists", desc: null, content: "正文", status: 1, type: 0, comment_num: 2, uid: 1, create_time: new Date(), update_time: new Date() },
  ];
  deletedCids.length = 0;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/contents.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(getHandler, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("列表返回全部文章(含 uid=1 已有文章)与分页", async () => {
    const r = (await callAdmin(getHandler, { method: "GET", cookie: await cookie() })) as { data: Array<Record<string, unknown>>; pagination: Record<string, number> };
    expect(r.pagination.total).toBe(1);
    expect(r.data[0]!.cid).toBe(10);
  });
});

describe("admin/contents/[cid].get", () => {
  test("存在 → 返回全文(success+data);404 不存在;非法 cid → 400", async () => {
    const c = await cookie();
    const r = (await callAdmin(getOneHandler, { method: "GET", params: { cid: "10" }, cookie: c })) as { success: boolean; data: { cid: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(10);

    await expect(callAdmin(getOneHandler, { method: "GET", params: { cid: "999" }, cookie: c })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(getOneHandler, { method: "GET", params: { cid: "abc" }, cookie: c })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/contents/[cid].put", () => {
  test("CSRF 缺失 → 403;非法 cid → 400;404 不存在", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(putHandler, { method: "PUT", params: { cid: "10" }, cookie: session, body: { title: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { cid: "abc" }, cookie: await cookie(), body: { title: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { cid: "999" }, cookie: await cookie(), body: { title: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("status 非法 → 400;slug 冲突(排除自身,命中他人)→ 400", async () => {
    const c = await cookie();
    contents.push({ cid: 20, title: "另一篇", slug: "other-slug", desc: null, content: null, status: 1, type: 0, comment_num: 0, uid: 1, create_time: new Date(), update_time: new Date() });
    await expect(callAdmin(putHandler, { method: "PUT", params: { cid: "10" }, cookie: c, body: { title: "x", status: 9, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { cid: "10" }, cookie: c, body: { title: "x", slug: "other-slug", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("更新成功(publishDate 合法)", async () => {
    const c = await cookie();
    const r = (await callAdmin(putHandler, { method: "PUT", params: { cid: "10" }, cookie: c, body: { title: "改名", publishDate: "2026-01-01", csrfToken: CSRF_TOKEN } })) as { success: boolean; data: { cid: number } };
    expect(r.data.cid).toBe(10);
    expect(contents.find(c => c.cid === 10)?.title).toBe("改名");
  });
});

describe("admin/contents delete / batch-delete", () => {
  test("DELETE:CSRF header;成功删除;404 重复", async () => {
    const c = await cookie();
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteOneHandler, { method: "DELETE", params: { cid: "10" }, cookie: c })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(deleteOneHandler, { method: "DELETE", params: { cid: "10" }, cookie: c, headers: h })).resolves.toBeTruthy();
    expect(deletedCids).toContain(10);
    await expect(callAdmin(deleteOneHandler, { method: "DELETE", params: { cid: "10" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 404 });
    expect(contents.find(c => c.cid === 10)).toBeUndefined();
  });

  test("batch-delete:空 ids/无效元素 → 400;批量删除成功", async () => {
    contents.push(
      { cid: 20, title: "b2", slug: "b2", desc: null, content: null, status: 1, type: 0, comment_num: 0, uid: 1, create_time: new Date(), update_time: new Date() },
      { cid: 30, title: "b3", slug: "b3", desc: null, content: null, status: 1, type: 0, comment_num: 0, uid: 1, create_time: new Date(), update_time: new Date() },
    );
    const c = await cookie();
    await expect(callAdmin(batchDeleteHandler, { cookie: c, body: { csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(batchDeleteHandler, { cookie: c, body: { ids: [true, null, -1], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(batchDeleteHandler, { cookie: c, body: { ids: [20, 30, true], csrfToken: CSRF_TOKEN } })).resolves.toBeTruthy();
    expect(contents.find(c => c.cid === 20)).toBeUndefined();
    expect(contents.find(c => c.cid === 30)).toBeUndefined();
  });
});
