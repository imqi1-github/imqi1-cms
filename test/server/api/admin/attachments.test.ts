import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface AttRow {
  aid: number; title: string; type: string; url: string; metadata: unknown;
  create_time: Date; linkedContents: Array<{ cid: number; title: string }>;
}
let rows: AttRow[] = [];

sharedFake.on("attachments", "count", async () => rows.length);
sharedFake.on("attachments", "findMany", async ({ where }: { where: { type?: string } }) =>
  rows
    .filter(r => !where?.type || r.type === where.type)
    .map(r => ({
      aid: r.aid, title: r.title, type: r.type, url: r.url, metadata: r.metadata, create_time: r.create_time,
      contentattachments: r.linkedContents.map(c => ({ content: c })),
    })));
sharedFake.on("attachments", "findUnique", async ({ where }: { where: { aid: number } }) => {
  const row = rows.find(r => r.aid === where.aid);
  return row
    ? {
        ...row,
        contentattachments: row.linkedContents.map(c => ({ content: c })),
      }
    : null;
});
sharedFake.on("attachments", "update", async ({ where, data }: { where: { aid: number }; data: { title?: string } }) => {
  const row = rows.find(r => r.aid === where.aid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  if (data.title !== undefined) row.title = data.title;
  return { ...row };
});

const getAllHandler = (await import("#server/api/admin/attachments/all.get")).default;
const getOneHandler = (await import("#server/api/admin/attachments/[id].get")).default;
const patchHandler = (await import("#server/api/admin/attachments/[id].patch")).default;

beforeEach(() => {
  rows = [
    { aid: 1, title: "图片甲", type: "image", url: "/uploads/a.png?size=large", metadata: { size: 100, width: 800, height: 600, format: "png" }, create_time: new Date(), linkedContents: [{ cid: 10, title: "文章十" }] },
    { aid: 2, title: "文件乙", type: "file", url: "not-a-url", metadata: null, create_time: new Date(), linkedContents: [] },
  ];
  // 重注册:handler 表全进程共享,不重注册会被其它测试文件覆盖
  sharedFake.on("attachments", "count", async () => rows.length);
  sharedFake.on("attachments", "findMany", async ({ where }: { where: { type?: string } }) =>
    rows
      .filter(r => !where?.type || r.type === where.type)
      .map(r => ({
        aid: r.aid, title: r.title, type: r.type, url: r.url, metadata: r.metadata, create_time: r.create_time,
        contentattachments: r.linkedContents.map(c => ({ content: c })),
      })));
  sharedFake.on("attachments", "findUnique", async ({ where }: { where: { aid: number } }) => {
    const row = rows.find(r => r.aid === where.aid);
    return row ? { ...row, contentattachments: row.linkedContents.map(c => ({ content: c })) } : null;
  });
  sharedFake.on("attachments", "update", async ({ where, data }: { where: { aid: number }; data: { title?: string } }) => {
    const row = rows.find(r => r.aid === where.aid);
    if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
    if (data.title !== undefined) row.title = data.title;
    return { ...row };
  });
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/attachments/all.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(getAllHandler, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("列表:metadata 归一化(type 筛选/分页)", async () => {
    const r = (await callAdmin(getAllHandler, { method: "GET", cookie: await loginSessionCookie() })) as { data: { list: Array<Record<string, unknown>> } };
    expect(r.data.list).toHaveLength(2);
    const first = r.data.list[0]!;
    expect(first.id).toBe(1);
    expect(first.width).toBe(800);
    expect(first.format).toBe("png");
  });

  test("type 筛选只回 image", async () => {
    const r = (await callAdmin(getAllHandler, { method: "GET", cookie: await loginSessionCookie(), url: "/api/admin/attachments/all?type=image" })) as { data: { list: Array<Record<string, unknown>> } };
    expect(r.data.list).toHaveLength(1);
    expect(r.data.list[0]!.type).toBe("image");
  });
});

describe("admin/attachments/[id].get", () => {
  test("404 不存在;非法 id → 400", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "999" }, cookie: session })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "abc" }, cookie: session })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("返回详情:metadata 缺失时 format 从 URL 扩展名推断;关联文章列出", async () => {
    const session = await loginSessionCookie();
    const r = (await callAdmin(getOneHandler, { method: "GET", params: { id: "1" }, cookie: session })) as { data: Record<string, unknown> };
    expect(r.data.format).toBe("png");
    expect(r.data.contents).toEqual([{ cid: 10, title: "文章十" }]);

    const r2 = (await callAdmin(getOneHandler, { method: "GET", params: { id: "2" }, cookie: session })) as { data: Record<string, unknown> };
    expect(r2.data.format).toBeNull();
  });
});

describe("admin/attachments/[id].patch(改名)", () => {
  test("CSRF 缺失 → 403;404 不存在;改名成功", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: session, body: { title: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "999" }, cookie: await cookie(), body: { title: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
    const r = (await callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: await cookie(), body: { name: "改名附件", csrfToken: CSRF_TOKEN } })) as Record<string, unknown>;
    expect(r).toBeTruthy();
    expect(rows[0]!.title).toBe("改名附件");
  });
});
