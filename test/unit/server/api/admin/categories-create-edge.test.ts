/**
 * admin/categories/create.post 补测:
 *  - 401/CSRF/400 守卫
 *  - name 必填非空 → 400
 *  - name 非字符串 → 400
 *  - slug/desc 非字符串 → 400
 *  - 字段长度上限
 *  - name 已被占用 → 400
 *  - slug 已被占用 → 400
 *  - 成功创建 → 返回 mid/name/slug/desc 白名单
 *  - P2002 → 400 而非 500
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();
mock.module("#server/utils/content-cache", () => ({ invalidateContentCaches: async () => ({}) }));

const handler = (await import("#server/api/admin/categories/create.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

async function callCreate(opts: { body?: Record<string, unknown>; cookie?: string }) {
  return callAdmin(handler, {
    method: "POST",
    body: { csrfToken: CSRF_TOKEN, ...(opts.body ?? {}) },
    cookie: opts.cookie ?? await cookie(),
  });
}

describe("admin/categories/create.post 守卫", () => {
  test("未登录 → 401", async () => {
    await expect(callCreate({ cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      body: { name: "x" },
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("admin/categories/create.post 类型与必填", () => {
  test("name 缺省 → 400", async () => {
    await expect(callCreate({ body: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("name 非字符串 → 400", async () => {
    await expect(callCreate({ body: { name: 123 } })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
  });

  test("name 空字符串/纯空白 → 400", async () => {
    await expect(callCreate({ body: { name: "" } })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });
    await expect(callCreate({ body: { name: "   " } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 非字符串 → 400", async () => {
    await expect(callCreate({ body: { name: "x", slug: 999 } })).rejects.toMatchObject({ statusCode: 400, message: "分类标识格式错误" });
  });

  test("desc 非字符串 → 400", async () => {
    await expect(callCreate({ body: { name: "x", desc: ["x"] } })).rejects.toMatchObject({ statusCode: 400, message: "分类描述格式错误" });
  });

  test("name 超 100 字符 → 400", async () => {
    await expect(callCreate({ body: { name: "n".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("slug 超 100 字符 → 400", async () => {
    await expect(callCreate({ body: { name: "x", slug: "s".repeat(101) } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin/categories/create.post 唯一性", () => {
  test("name 已被占用 → 400", async () => {
    sharedFake.on("metas", "findFirst", async () => ({ mid: 1, name: "分类甲", slug: "cat-a", desc: null, type: "category" }));
    await expect(callCreate({ body: { name: "分类甲" } })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
  });

  test("slug 已被占用 → 400", async () => {
    sharedFake.on("metas", "findFirst", async ({ where }: { where: Record<string, unknown> } = { where: {} }) => {
      if (where.slug === "cat-a") return { mid: 1, name: "其他", slug: "cat-a", desc: null, type: "category" };
      return null;
    });
    await expect(callCreate({ body: { name: "新分类", slug: "cat-a" } })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });
  });
});

describe("admin/categories/create.post 业务逻辑", () => {
  test("成功创建 → 返回 mid/name/slug/desc 白名单字段", async () => {
    sharedFake.on("metas", "create", async () => ({ mid: 100, name: "新分类", slug: "new-cat", desc: null, type: "category" }));
    const r = (await callCreate({ body: { name: "新分类", slug: "new-cat" } })) as { success: boolean; data: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(["desc", "mid", "name", "slug"]);
  });

  test("slug 缺省 → 写 null", async () => {
    let captured: { slug: unknown } | null = null;
    sharedFake.on("metas", "create", async ({ data }: { data: { slug?: unknown } }) => {
      captured = { slug: data.slug };
      return { mid: 1, ...data, type: "category" };
    });
    await callCreate({ body: { name: "新分类" } });
    expect(captured!.slug).toBeNull();
  });
});

describe("admin/categories/create.post:并发兜底", () => {
  test("P2002 唯一约束冲突 → 400 而非 500", async () => {
    sharedFake.on("metas", "create", async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    await expect(callCreate({ body: { name: "新分类" } })).rejects.toMatchObject({ statusCode: 400, message: "分类名称或标识已存在" });
  });
});