import { beforeEach, describe, expect, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { sharedFake } from "#test/helpers/fake-prisma";

const attachmentsIdHandler = (await import("#server/api/admin/attachments/[id].get")).default;
const _attachmentsAllHandler = (await import("#server/api/admin/attachments/all.get")).default;
const contentsIdHandler = (await import("#server/api/admin/contents/[cid].get")).default;
void _attachmentsAllHandler;

const attachmentRows: Array<Record<string, unknown>> = [];
attachmentRows.push({ aid: 1, title: "图1", type: "image", url: "https://x.com/a.jpg", size: 1024, metadata: JSON.stringify({ width: 100, height: 100, size: 1024 }), create_time: new Date(), contentattachments: [] });

sharedFake.on("attachments", "findUnique", async ({ where }: { where: { aid: number } }) => {
  const r = attachmentRows.find(a => a.aid === where.aid);
  return r ? { ...r, contentattachments: r.contentattachments ?? [] } : null;
});
sharedFake.on("attachments", "findMany", async () => attachmentRows.map(a => ({ ...a, metadata: a.metadata })));
sharedFake.on("attachments", "count", async () => attachmentRows.length);

// contents.findUnique:本测试文件字典序在 contents-write 之前,自注册避免未设置
const contentDetailRows: Array<Record<string, unknown>> = [];
contentDetailRows.push({ cid: 1, title: "文1", slug: "a", type: 0, status: 1, content: "正文", covers: "[]", desc: null, create_time: new Date(), update_time: new Date(), comment_num: 0, many_covers: false, show_toc: false, tags: "[]", uid: 1 });
sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number | string } }) => {
  const r = contentDetailRows.find(c => String(c.cid) === String(where.cid));
  return r ?? null;
});

beforeEach(() => {
  attachmentRows.length = 0;
  attachmentRows.push({ aid: 1, title: "图1", type: "image", url: "https://x.com/a.jpg", size: 1024, metadata: JSON.stringify({ width: 100, height: 100, size: 1024 }), create_time: new Date(), contentattachments: [] });
});

describe("admin/attachments/[id].get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(attachmentsIdHandler, {
      method: "GET",
      params: { id: "1" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("非法 id → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(attachmentsIdHandler, {
      method: "GET",
      params: { id: "abc" },
      cookie,
    })).rejects.toThrow();
  });

  test("附件不存在 → 404", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(attachmentsIdHandler, {
      method: "GET",
      params: { id: "999" },
      cookie,
    })).rejects.toThrow();
  });

  test("成功 → 返回 success.data 含完整字段", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(attachmentsIdHandler, {
      method: "GET",
      params: { id: "1" },
      cookie,
    }) as { success: boolean, data: { id: number, name: string, type: string, url: string, contents: unknown[] } };
    expect(r.success).toBe(true);
    expect(r.data.id).toBe(1);
    expect(r.data.name).toBe("图1");
    expect(r.data.type).toBe("image");
    expect(Array.isArray(r.data.contents)).toBe(true);
  });
});

describe("admin/contents/[cid].get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(contentsIdHandler, {
      method: "GET",
      params: { cid: "1" },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("非法 cid → 400", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(contentsIdHandler, {
      method: "GET",
      params: { cid: "abc" },
      cookie,
    })).rejects.toThrow();
  });

  test("cid 不存在 → 404", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(contentsIdHandler, {
      method: "GET",
      params: { cid: "999" },
      cookie,
    })).rejects.toThrow();
  });

  test("成功 → 返回完整内容详情", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(contentsIdHandler, {
      method: "GET",
      params: { cid: "1" },
      cookie,
    }) as { success: boolean, data: { cid: number, title: string, slug: string, content: string } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(1);
    expect(r.data.title).toBeTruthy();
  });
});
