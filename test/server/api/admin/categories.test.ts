import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, resetMetas } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// metas 表假件统一在 test/helpers/admin.ts 注册,这里只复位到统一初值
beforeEach(() => resetMetas());

const getCategories = (await import("#server/api/admin/categories.get")).default;
const createCategory = (await import("#server/api/admin/categories/create.post")).default;
const updateCategory = (await import("#server/api/admin/categories/[id].put")).default;
const deleteCategory = (await import("#server/api/admin/categories/[id].delete")).default;

async function loginAndCsrf(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/categories", () => {
  test("未登录 GET → 401", async () => {
    await expect(callAdmin(getCategories, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("GET 列表白名单(mid/name/slug/desc/contentCount),只含分类", async () => {
    const list = (await callAdmin(getCategories, { method: "GET", cookie: await loginSessionCookie() })) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("分类甲");
    expect(Object.keys(list[0]!).sort()).toEqual(["contentCount", "desc", "mid", "name", "slug"]);
    expect(list[0]!.type).toBeUndefined();
  });

  test("POST:CSRF 缺失 → 403;name 空 → 400;成功创建返回 success+data", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(createCategory, { cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(createCategory, { cookie: `${session}; ${CSRF_COOKIE}`, body: { name: "", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    const created = await callAdmin(createCategory, { cookie: `${session}; ${CSRF_COOKIE}`, body: { name: "新分类", slug: "new-cat", csrfToken: CSRF_TOKEN } }) as { success: boolean; data: Record<string, unknown> };
    expect(created.success).toBe(true);
    expect(created.data).toMatchObject({ name: "新分类", slug: "new-cat" });
  });

  test("PUT:更新命中分类(部分更新保留未传字段)", async () => {
    const cookie = await loginAndCsrf();
    const updated = await callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie, body: { name: "改名分类", csrfToken: CSRF_TOKEN } }) as { data: Record<string, unknown> };
    expect(updated.data).toMatchObject({ mid: 2, name: "改名分类", slug: "cat-a" });
  });

  test("DELETE:删分类成功;仅剩一个分类时 → 400 至少保留一个分类", async () => {
    const cookie = await loginAndCsrf();
    const h = { "x-csrf-token": CSRF_TOKEN };
    // 先补一个分类,再删旧的 → success
    await callAdmin(createCategory, { cookie, body: { name: "备用分类", slug: "backup", csrfToken: CSRF_TOKEN } });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie, headers: h })).resolves.toMatchObject({ success: true });
    // 只剩最后一个分类 → 事务内 count 判定拒绝
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "102" }, cookie, headers: h })).rejects.toMatchObject({ statusCode: 400 });
  });
});
