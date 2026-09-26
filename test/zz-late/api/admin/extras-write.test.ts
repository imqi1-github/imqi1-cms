import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";

const fakePrisma = await import("#test/helpers/fake-prisma");

// ===== contentrelations / contents 假件(content-tags put 用) =====
const contentRows: Array<{ cid: number }> = [];
const contentrelationsRows: Array<Record<string, unknown>> = [];
const contentrelationCreates: Array<Record<string, unknown>> = [];
const contentrelationDeletes: Array<Record<string, unknown>> = [];

contentRows.push({ cid: 1 });
contentRows.push({ cid: 2 });

fakePrisma.sharedFake.on("contents", "findUnique", async ({ where }: { where: { cid: number } }) =>
  contentRows.find(c => c.cid === where.cid) ?? null);

// metas type=tag 用于校验
const metaTagRows: Array<{ mid: number; type: string }> = [
  { mid: 100, type: "tag" },
  { mid: 101, type: "tag" },
  { mid: 200, type: "category" },
];
fakePrisma.sharedFake.on("metas", "findMany", async ({ where }: { where: { mid: { in: number[] }; type: string } }) => {
  if (where.type !== "tag") return [];
  return metaTagRows.filter(m => m.type === "tag" && where.mid.in.includes(m.mid));
});

fakePrisma.sharedFake.on("contentrelations", "deleteMany", async ({ where }: { where: Record<string, unknown> }) => {
  contentrelationDeletes.push({ ...where });
  const cid = (where.cid as { equals?: number } | number) ?? 0;
  const cidVal = typeof cid === "object" && cid.equals !== undefined ? cid.equals : cid;
  for (let i = contentrelationsRows.length - 1; i >= 0; i--) {
    if (contentrelationsRows[i]!.cid === cidVal) contentrelationsRows.splice(i, 1);
  }
  return { count: 1 };
});
fakePrisma.sharedFake.on("contentrelations", "createMany", async ({ data }: { data: Array<Record<string, unknown>> }) => {
  contentrelationCreates.push(...data);
  for (const d of data) contentrelationsRows.push({ ...d });
  return { count: data.length };
});

// ===== handlers =====
const contentTagsPutHandler = (await import("#server/api/admin/content-tags/[id].put")).default;
const contentCategoriesPutHandler = (await import("#server/api/admin/content-categories/[id].put")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  contentrelationCreates.length = 0;
  contentrelationDeletes.length = 0;
  contentrelationsRows.length = 0;
});

describe("content-tags/[id].put(文章标签关联)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      cookie: CSRF_COOKIE,
      body: { tagIds: [], csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: [] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("非法 cid → 400", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { tagIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { tagIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("tagIds 非数组 → 400", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: "string", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/tagIds/);
  });

  test("tag 中含分类 mid → 400(预检 type=tag)", async () => {
    await expect(callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: [100, 200], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/无效的标签/);
  });

  test("成功:空 tagIds 数组 → 仅清空原有关联", async () => {
    const r = await callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(contentrelationDeletes).toHaveLength(1);
    expect(contentrelationCreates).toHaveLength(0);
  });

  test("成功:多 tagIds 写入 contentrelations", async () => {
    const r = await callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: [100, 101], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(contentrelationCreates).toHaveLength(2);
  });

  test("tagIds 含非数字/负数 → 被过滤掉", async () => {
    await callAdmin(contentTagsPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { tagIds: [100, "abc", -1, 0, 101], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    // 只有 100/101 是合法正整数,被写入
    expect(contentrelationCreates).toHaveLength(2);
    expect(contentrelationCreates[0]).toMatchObject({ cid: 1, mid: 100 });
    expect(contentrelationCreates[1]).toMatchObject({ cid: 1, mid: 101 });
  });
});

describe("content-categories/[id].put(文章分类关联)", () => {
  test("非法 cid → 400", async () => {
    await expect(callAdmin(contentCategoriesPutHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { categoryIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("categoryIds 非数组 → 400", async () => {
    await expect(callAdmin(contentCategoriesPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { categoryIds: 123, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/categoryIds/);
  });

  test("文章不存在 → 404", async () => {
    await expect(callAdmin(contentCategoriesPutHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { categoryIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("成功:空数组 → 清空", async () => {
    const r = await callAdmin(contentCategoriesPutHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { categoryIds: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});
