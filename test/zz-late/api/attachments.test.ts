import "#test/helpers/nitro-globals";

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, makeAuthEvent, loginSessionCookie } from "#test/helpers/auth-fakes";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// ===== COS 上传/删除:可控结果 =====
let cosResult: { success: boolean; url?: string; error?: string } = { success: true, url: "https://bucket.cos.example/img.png" };
const cosDeleted: string[] = [];
mock.module("#server/utils/cos", () => ({
  uploadToCOS: async () => cosResult,
  deleteFromCOS: async (url: string) => {
    cosDeleted.push(url);
    return { success: true };
  },
}));

// ===== prisma 假件 =====
let contentRow: { cid: number; uid: number } | null = { cid: 1, uid: 1 };
const createdAttachments: Array<Record<string, unknown>> = [];
const createdRelations: Array<Record<string, unknown>> = [];
const deletedRelations: Array<Record<string, unknown>> = [];
const deletedAttachments: number[] = [];
let attachmentRows: Array<Record<string, unknown>> = [];

sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) =>
  contentRow && contentRow.cid === where.cid ? { ...contentRow } : null);
sharedFake.on("attachments", "findMany", async () => attachmentRows.map(r => ({ ...r })));
sharedFake.on("attachments", "findUnique", async ({ where }: { where: { aid: number } }) => {
  const row = attachmentRows.find(r => r.aid === where.aid);
  return row ? { ...row, contentattachments: (row.linkedContents as Array<{ uid: number }>).map(c => ({ cid: 1, content: { uid: c.uid } })) } : null;
});
sharedFake.on("attachments", "create", async ({ data }: { data: Record<string, unknown> }) => {
  createdAttachments.push({ ...data });
  return { aid: 501, create_time: new Date(), ...data };
});
sharedFake.on("attachments", "delete", async ({ where }: { where: { aid: number } }) => {
  deletedAttachments.push(where.aid);
  return {};
});
sharedFake.on("contentattachments", "create", async ({ data }: { data: Record<string, unknown> }) => {
  createdRelations.push({ ...data });
  return data;
});
sharedFake.on("contentattachments", "deleteMany", async ({ where }: { where: { aid: number; cid: number } }) => {
  deletedRelations.push({ ...where });
  return { count: 1 };
});
sharedFake.on("$transaction", async (fn: unknown) => (typeof fn === "function" ? await (fn as (tx: unknown) => Promise<unknown>)(sharedFake.prisma) : fn));

// 上传位置设置
let uploadLocation: string | null = null;

sharedFake.on("informations", "findUnique", ({ where }: { where: { key: string } }) => {
  if (where.key === "uploadLocation") return uploadLocation ? { value: uploadLocation } : null;
  if (where.key === "sessionStoreType") return { value: "memory" };
  return null;
});

const listHandler = (await import("#server/api/attachments/list.get")).default;
const uploadHandler = (await import("#server/api/attachments/upload.post")).default;
const deleteHandler = (await import("#server/api/attachments/[id].delete")).default;

// ===== 本地上传目录(临时) =====
const uploadsDir = mkdtempSync(join(tmpdir(), "imqi1-uploads-test-"));
process.env.UPLOADS_DIR = uploadsDir;
afterAll(() => {
  rmSync(uploadsDir, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
});

// ===== readFormData 替身 =====
function fakeFile(name: string, type: string, bytes: number[], sizeOverride?: number) {
  const arr = new Uint8Array(bytes);
  return {
    name,
    type,
    size: sizeOverride ?? arr.byteLength,
    arrayBuffer: async () => arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength),
  };
}
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];

async function uploadCall(file: ReturnType<typeof fakeFile> | null, opts: { cookie?: string; cid?: string; livePhoto?: boolean; csrf?: string } = {}) {
  const form = {
    get: (k: string) => {
      if (k === "file") return file;
      if (k === "csrfToken") return opts.csrf ?? CSRF_TOKEN;
      if (k === "livePhoto") return opts.livePhoto ? "true" : undefined;
      return undefined;
    },
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.readFormData = async () => form;
  const url = opts.cid !== undefined ? `/api/attachments/upload?cid=${opts.cid}` : "/api/attachments/upload";
  const { event } = makeAuthEvent({ method: "POST", peer: "10.9.0.1", url, cookie: opts.cookie ?? `${await loginSessionCookie()}; ${CSRF_COOKIE}` });
  return uploadHandler(event as never) as Promise<Record<string, unknown>>;
}

async function deleteCall(aid: string, opts: { cookie?: string; csrfHeader?: string | null; cid?: string } = {}) {
  const { event } = makeAuthEvent({
    method: "DELETE",
    peer: "10.9.1.1",
    params: { id: aid },
    url: `/api/attachments/${aid}${opts.cid ? `?cid=${opts.cid}` : ""}`,
    cookie: opts.cookie ?? `${await loginSessionCookie()}; ${CSRF_COOKIE}`,
    headers: { "x-csrf-token": opts.csrfHeader === null ? "" : (opts.csrfHeader ?? CSRF_TOKEN) },
  });
  return deleteHandler(event as never) as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  contentRow = { cid: 1, uid: 1 };
  uploadLocation = null;
  cosResult = { success: true, url: "https://bucket.cos.example/img.png" };
  createdAttachments.length = 0;
  createdRelations.length = 0;
  deletedRelations.length = 0;
  deletedAttachments.length = 0;
  attachmentRows = [];
});

describe("attachments/list.get", () => {
  test("未登录 401;cid 非法 400;文章不存在 404", async () => {
    const { event: e1 } = makeAuthEvent({ method: "GET", peer: "10.9.2.1", url: "/api/attachments/list?cid=1" });
    await expect(listHandler(e1 as never)).rejects.toMatchObject({ statusCode: 401 });
    const cookie = `${await loginSessionCookie()}`;
    const { event: e2 } = makeAuthEvent({ method: "GET", peer: "10.9.2.2", url: "/api/attachments/list?cid=abc", cookie });
    await expect(listHandler(e2 as never)).rejects.toMatchObject({ statusCode: 400 });
    contentRow = null;
    const { event: e3 } = makeAuthEvent({ method: "GET", peer: "10.9.2.3", url: "/api/attachments/list?cid=1", cookie });
    await expect(listHandler(e3 as never)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("白名单字段(storage 不外泄) + metadata 归一", async () => {
    attachmentRows = [
      { aid: 1, title: "图甲", type: "image", url: "/uploads/a.png", metadata: { width: 10, height: 20, size: 5, format: "png", storage: "local" }, create_time: new Date() },
    ];
    const { event } = makeAuthEvent({ method: "GET", peer: "10.9.2.4", url: "/api/attachments/list?cid=1", cookie: `${await loginSessionCookie()}` });
    const r = (await listHandler(event as never)) as unknown as { success: boolean; data: Array<Record<string, unknown>> };
    expect(r.success).toBe(true);
    expect(r.data[0]).toMatchObject({ id: 1, name: "图甲", type: "image", width: 10, height: 20, format: "png", size: 5 });
    expect(JSON.stringify(r)).not.toContain('"storage"');
  });
});

describe("attachments/upload.post", () => {
  test("未登录 401;cid 非法 400;cid 不存在 404", async () => {
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG), { cookie: "", cid: "1" })).rejects.toMatchObject({ statusCode: 401 });
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG), { cid: "abc" })).rejects.toMatchObject({ statusCode: 400 });
    contentRow = null;
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG), { cid: "1" })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("CSRF 错误 403;无文件 400;类型不支持 400", async () => {
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG), { csrf: "wrong" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(uploadCall(null)).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadCall(fakeFile("a.html", "text/html", [0x3c]))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("实况照片必须 JPEG;超大小直接拒(不读内容);魔数不符 400", async () => {
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG), { livePhoto: true })).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadCall(fakeFile("big.png", "image/png", PNG, 10 * 1024 * 1024 + 1))).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadCall(fakeFile("fake.png", "image/png", [0x47, 0x49, 0x46, 0x38]))).rejects.toMatchObject({ statusCode: 400 });
  });

  test("本地上传成功:落盘 + 建附件 + 关联文章", async () => {
    const r = (await uploadCall(fakeFile("a.png", "image/png", PNG), { cid: "1" })) as unknown as {
      success: boolean;
      data: { id: number; url: string; storage: string; type: string };
    };
    expect(r.success).toBe(true);
    expect(r.data.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\//);
    expect(r.data.storage).toBe("local");
    expect(r.data.type).toBe("image");
    // 文件确实写入临时目录
    expect(existsSync(join(uploadsDir, r.data.url.replace("/uploads/", "")))).toBe(true);
    expect(createdAttachments).toHaveLength(1);
    expect(createdRelations).toEqual([{ aid: 501, cid: 1 }]);
  });

  test("实况照片:url 追加 #live,格式兜底 jpg", async () => {
    const r = (await uploadCall(fakeFile("live.jpg", "image/jpeg", JPEG), { livePhoto: true, cid: "1" })) as unknown as { data: { url: string } };
    expect(r.data.url.endsWith("#live")).toBe(true);
  });

  test("COS 上传:走 uploadToCOS 并按配置入库", async () => {
    uploadLocation = "cos";
    const r = (await uploadCall(fakeFile("a.png", "image/png", PNG))) as unknown as { data: { url: string; storage: string } };
    expect(r.data.url).toBe("https://bucket.cos.example/img.png");
    expect(r.data.storage).toBe("cos");
    expect(createdRelations).toHaveLength(0);
  });

  test("上传失败 → 500", async () => {
    cosResult = { success: false, error: "boom" };
    uploadLocation = "cos";
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG))).rejects.toMatchObject({ statusCode: 500 });
  });

  test("本地上传写盘失败 → 500 本地上传失败", async () => {
    const blocker = join(uploadsDir, "not-a-dir");
    writeFileSync(blocker, "x");
    process.env.UPLOADS_DIR = blocker;
    await expect(uploadCall(fakeFile("a.png", "image/png", PNG))).rejects.toMatchObject({ statusCode: 500, message: "本地上传失败" });
    process.env.UPLOADS_DIR = uploadsDir;
  });
});

describe("attachments/[id].delete", () => {
  const ownedRow = () => ({ aid: 9, title: "图", type: "image", url: "/uploads/x.png", storage: "cos", metadata: {}, linkedContents: [{ uid: 1 }] });

  test("未登录 401;id 非法 400;CSRF 缺失 403", async () => {
    const { event: e1 } = makeAuthEvent({ method: "DELETE", peer: "10.9.3.1", params: { id: "9" }, url: "/api/attachments/9" });
    await expect(deleteHandler(e1 as never)).rejects.toMatchObject({ statusCode: 401 });
    await expect(deleteCall("abc")).rejects.toMatchObject({ statusCode: 400 });
    await expect(deleteCall("9", { csrfHeader: null })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("附件不存在 404;cid 参数非法 400(不得静默落入全局删除)", async () => {
    attachmentRows = [];
    await expect(deleteCall("9")).rejects.toMatchObject({ statusCode: 404 });
    attachmentRows = [ownedRow()];
    await expect(deleteCall("9", { cid: "abc" })).rejects.toMatchObject({ statusCode: 400 });
    expect(deletedAttachments).toHaveLength(0);
  });

  test("取消关联:只删关系不删文件", async () => {
    attachmentRows = [ownedRow()];
    const r = (await deleteCall("9", { cid: "1" })) as unknown as { success: boolean; detached: boolean };
    expect(r.detached).toBe(true);
    expect(deletedRelations).toEqual([{ aid: 9, cid: 1 }]);
    expect(deletedAttachments).toHaveLength(0);
    expect(cosDeleted).toHaveLength(0);
  });

  test("无权:目标文章他人 / 附件归属他人 → 403", async () => {
    contentRow = { cid: 1, uid: 2 };
    attachmentRows = [ownedRow()];
    await expect(deleteCall("9", { cid: "1" })).rejects.toMatchObject({ statusCode: 403 });

    contentRow = { cid: 1, uid: 1 };
    attachmentRows = [{ ...ownedRow(), linkedContents: [{ uid: 2 }] }];
    await expect(deleteCall("9")).rejects.toMatchObject({ statusCode: 403 });
    expect(deletedAttachments).toHaveLength(0);
  });

  test("全局删除:删文件(COS) + 删记录", async () => {
    attachmentRows = [ownedRow()];
    const r = (await deleteCall("9")) as unknown as { success: boolean };
    expect(r.success).toBe(true);
    expect(cosDeleted).toEqual(["/uploads/x.png"]);
    expect(deletedAttachments).toEqual([9]);
  });
});
