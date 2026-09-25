import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface ContentRow { cid: number; title: string; slug: string | null; desc: string | null; content: string | null; status: number; type: number; uid: number }
let contents: ContentRow[] = [];

sharedFake.on("contents", "create", async ({ data }: { data: Partial<ContentRow> }) => {
  const row: ContentRow = {
    cid: (contents.length + 1) * 10,
    title: data.title ?? "",
    slug: data.slug ?? null,
    desc: data.desc ?? null,
    content: data.content ?? null,
    status: data.status ?? 1,
    type: data.type ?? 0,
    uid: data.uid ?? 1,
  };
  contents.push(row);
  return { ...row };
});
sharedFake.on("contents", "findFirst", async ({ where }: { where: { slug?: string; type?: number } }) => {
  const row = contents.find(c => c.slug === where.slug && c.type === where.type);
  return row ? { ...row } : null;
});
sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) => {
  const row = contents.find(c => c.cid === where.cid);
  return row ? { ...row } : null;
});
sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: Partial<ContentRow> }) => {
  const row = contents.find(c => c.cid === where.cid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  return { ...row };
});

const postHandler = (await import("#server/api/admin/contents.post")).default;
const getHandler = (await import("#server/api/admin/contents.get")).default;

beforeEach(() => {
  contents = [];
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/contents.post", () => {
  test("未登录 → 401;CSRF 缺失 → 403", async () => {
    await expect(callAdmin(postHandler, { body: { title: "x" } })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(postHandler, { cookie: session, body: { title: "x" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("title 空/非字符串 → 400;status/type 非法枚举 → 400", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { title: "", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(postHandler, { cookie: c, body: { title: 123, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(postHandler, { cookie: c, body: { title: "x", status: 2, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(postHandler, { cookie: c, body: { title: "x", type: 5, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 重复 → 400(同 type 下唯一)", async () => {
    contents = [{ cid: 10, title: "已有", slug: "dup", desc: null, content: null, status: 1, type: 0, uid: 1 }];
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { title: "新", slug: "dup", type: 0, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("publishDate 非法 → 400;合法创建成功并回填 cid", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { title: "x", publishDate: "not-a-date", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });

    const r = (await callAdmin(postHandler, { cookie: c, body: { title: "新文章", publishDate: "2026-01-01", csrfToken: CSRF_TOKEN } })) as { success: boolean; data: { cid: number } };
    expect(r.success).toBe(true);
    expect(typeof r.data.cid).toBe("number");
  });
});

describe("admin/contents.get", () => {
  test("未登录 → 401;分页与形状", async () => {
    await expect(callAdmin(getHandler, {})).rejects.toMatchObject({ statusCode: 401 });
  });
});
