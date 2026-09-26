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

// contentattachments 假件(补测的 cids 关联需要)
const contentAttachments: Array<{ aid: number; cid: number }> = [];
function registerAttachmentExtraFakes(): void {
  sharedFake.on("contentattachments", "deleteMany", async ({ where }: { where: { aid: number } }) => {
    const before = contentAttachments.length;
    for (let i = contentAttachments.length - 1; i >= 0; i--) {
      if (contentAttachments[i]!.aid === where.aid) contentAttachments.splice(i, 1);
    }
    return { count: before - contentAttachments.length };
  });
  sharedFake.on("contentattachments", "createMany", async ({ data }: { data: Array<{ aid: number; cid: number }> }) => {
    data.forEach(d => contentAttachments.push({ ...d }));
    return { count: data.length };
  });
}

describe("admin/attachments/[id].get 分支补测", () => {
  beforeEach(registerAttachmentExtraFakes);

  test("未登录 → 401;无效 id → 400", async () => {
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "1" } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "abc" }, cookie: await loginSessionCookie() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "0" }, cookie: await loginSessionCookie() })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("metadata 无 format 时从 URL pathname 扩展名推断(image)", async () => {
    const session = await loginSessionCookie();
    rows[0]!.metadata = { size: 10 };
    rows[0]!.url = "https://cdn.example.com/a/b.png?size=large#x";
    const r = (await callAdmin(getOneHandler, { method: "GET", params: { id: "1" }, cookie: session })) as { data: { format: string | null; width: unknown } };
    expect(r.data.format).toBe("png");
  });

  test("非 image 类型不推断 format;非法 URL 兜底 null;404;500", async () => {
    const session = await loginSessionCookie();
    rows[1]!.metadata = null;
    const r = (await callAdmin(getOneHandler, { method: "GET", params: { id: "2" }, cookie: session })) as { data: { format: string | null } };
    expect(r.data.format).toBeNull();

    rows[0]!.metadata = null;
    rows[0]!.url = "not-a-url";
    const r2 = (await callAdmin(getOneHandler, { method: "GET", params: { id: "1" }, cookie: session })) as { data: { format: string | null } };
    expect(r2.data.format).toBeNull();

    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "999" }, cookie: session })).rejects.toMatchObject({ statusCode: 404 });

    sharedFake.on("attachments", "findUnique", async () => { throw new Error("db down"); });
    await expect(callAdmin(getOneHandler, { method: "GET", params: { id: "1" }, cookie: session })).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("admin/attachments/[id].patch 分支补测", () => {
  beforeEach(() => { contentAttachments.length = 0; registerAttachmentExtraFakes(); });

  test("未登录 → 401;无效 id → 400;CSRF 缺失 → 403;404 不存在", async () => {
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "abc" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "999" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("改名:cids 未传时不动关联;name 非字符串收窄为空串", async () => {
    const c = await cookie();
    const r = (await callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: 123, csrfToken: CSRF_TOKEN } })) as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(r.data.name).toBe("");
    expect(contentAttachments).toHaveLength(0);
  });

  test("cids 全量替换并去重;空数组清空关联", async () => {
    const c = await cookie();
    await callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "图甲", cids: [10, 10, "20"], csrfToken: CSRF_TOKEN } });
    expect(contentAttachments.map(x => x.cid).sort()).toEqual([10, 20]);

    await callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "图甲", cids: [], csrfToken: CSRF_TOKEN } });
    expect(contentAttachments).toHaveLength(0);
  });

  test("cids 非法元素/非数组 → 400(绝不静默清空)", async () => {
    const c = await cookie();
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "x", cids: [0], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "cids 格式错误" });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "x", cids: [1.5], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "cids 格式错误" });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "x", cids: "nope", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "cids 格式错误" });
    expect(contentAttachments).toHaveLength(0);
  });

  test("cids 关联不存在内容(P2003)→ 400;未知 → 500", async () => {
    const c = await cookie();
    sharedFake.on("contentattachments", "createMany", async () => { throw Object.assign(new Error("P2003"), { code: "P2003" }); });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "x", cids: [99], csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的关联内容" });

    registerAttachmentExtraFakes();
    sharedFake.on("attachments", "update", async () => { throw new Error("db down"); });
    await expect(callAdmin(patchHandler, { method: "PATCH", params: { id: "1" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
  });
});
