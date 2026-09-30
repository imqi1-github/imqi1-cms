import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, METAS_INITIAL, callAdmin, loginSessionCookie, metas, registerMetasFakes, resetMetas } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// metas 表假件统一在 test/helpers/admin.ts 注册,这里只复位到统一初值
beforeEach(() => { registerMetasFakes(); resetMetas(); });

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

// contentrelations 假件:分类删除的「文章转移」分支需要它。
// 必须在 registerMetasFakes() 之后注册——它也注册 contentrelations 的 findMany/deleteMany,后注册者胜。
let relations: Array<{ cid: number; mid: number }> = [];
function registerCategoryRelationFakes(): void {
  sharedFake.on("contentrelations", "findMany", async ({ where }: { where: { mid?: number | { not: number }; cid?: number; metas?: { type: string } } }) => {
    // mid 支持数值与 { not } 两种形态(删除迁移分支用 mid: { not: categoryId } 找「其他分类」)
    const matchMid = (mid: number): boolean => {
      if (where.mid === undefined) return true;
      if (typeof where.mid === "number") return mid === where.mid;
      return mid !== where.mid.not;
    };
    return relations
      .filter(r => matchMid(r.mid))
      .filter(r => where.cid === undefined || r.cid === where.cid)
      .filter(r => !where.metas || metas.find(m => m.mid === r.mid)?.type === where.metas.type)
      .map(r => ({ cid: r.cid, mid: r.mid }));
  });

  sharedFake.on("contentrelations", "deleteMany", async ({ where }: { where: { mid?: number } }) => {
    const before = relations.length;
    relations = relations.filter(r => where.mid === undefined || r.mid !== where.mid);
    return { count: before - relations.length };
  });

  sharedFake.on("contentrelations", "create", async ({ data }: { data: { cid: number; mid: number } }) => {
    relations.push({ cid: data.cid, mid: data.mid });
    return data;
  });
}

describe("admin/categories 分支补测", () => {
  beforeEach(() => {
    relations = [];
    registerCategoryRelationFakes();
  });

  // DELETE 的事务内先判「至少保留一个分类」,故需要两个分类才能走到后续分支
  const seedTwoCategories = (): void =>
    resetMetas([
      ...METAS_INITIAL,
      { mid: 4, name: "分类乙", slug: "cat-b", desc: null, type: "category" },
    ]);


  test("写接口未登录 → 401(POST/PUT/DELETE)", async () => {
    await expect(callAdmin(createCategory, { body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("PUT:401/400/403 前置校验矩阵", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "abc" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "-1" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("PUT:字段类型与必填校验 → 400", async () => {
    const c = await loginAndCsrf();
    const put = (body: unknown) => callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body });
    await expect(put({ name: 123, csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
    await expect(put({ name: "x", slug: 5, csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类标识格式错误" });
    await expect(put({ name: "x", desc: {}, csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类描述格式错误" });
    await expect(put({ name: "   ", csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类名称不能为空" });
  });

  test("PUT:404 分类不存在(传标签 mid 也算不存在,type 隔离)", async () => {
    const c = await loginAndCsrf();
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "999" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "1" }, cookie: c, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("PUT:重名 → 400,但排除自身", async () => {
    const c = await loginAndCsrf();
    await callAdmin(createCategory, { cookie: c, body: { name: "分类乙", slug: "cat-b", csrfToken: CSRF_TOKEN } });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类乙", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
    const ok = (await callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类甲", slug: "cat-a", csrfToken: CSRF_TOKEN } })) as { success: boolean };
    expect(ok.success).toBe(true);
  });

  test("PUT:slug 冲突 → 400;显式空串清空 slug/desc", async () => {
    const c = await loginAndCsrf();
    await callAdmin(createCategory, { cookie: c, body: { name: "分类丙", slug: "cat-c", csrfToken: CSRF_TOKEN } });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类甲", slug: "cat-c", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });

    const cleared = (await callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类甲", slug: "", desc: "", csrfToken: CSRF_TOKEN } })) as { data: Record<string, unknown> };
    expect(cleared.data.slug).toBeNull();
    expect(cleared.data.desc).toBeNull();
  });

  test("PUT:并发删除 / 未知异常 → 404 / 500", async () => {
    const c = await loginAndCsrf();
    sharedFake.on("metas", "update", async () => { throw Object.assign(new Error("P2025"), { code: "P2025" }); });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类甲", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });

    sharedFake.on("metas", "findFirst", async () => { throw new Error("db down"); });
    await expect(callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: { name: "分类甲", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
    registerMetasFakes();
    resetMetas();
  });

  test("DELETE:401/400/403 前置校验矩阵", async () => {
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, headers: h })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "abc" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie: session, headers: h })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("DELETE:分类不存在(含传标签 mid)→ 404", async () => {
    seedTwoCategories();
    const c = await loginAndCsrf();
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "999" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "1" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("DELETE:有关联文章且文章无其他分类 → 迁移到目标分类", async () => {
    seedTwoCategories();
    const c = await loginAndCsrf();
    relations = [{ cid: 10, mid: 2 }];
    const r = (await callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })) as { success: boolean };
    expect(r.success).toBe(true);
    // 目标分类取「第一个非当前分类的 category」:种子中 mid 1/3 是标签,故落到 mid 4
    expect(relations).toEqual([{ cid: 10, mid: 4 }]);
  });

  test("DELETE:文章已有其他分类 → 不再重复建关联", async () => {
    seedTwoCategories();
    const c = await loginAndCsrf();
    relations = [{ cid: 10, mid: 2 }, { cid: 10, mid: 4 }];
    await callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } });
    expect(relations.filter(r => r.cid === 10)).toEqual([{ cid: 10, mid: 4 }]);
  });

  test("DELETE:未知异常 → 500", async () => {
    const c = await loginAndCsrf();
    sharedFake.on("metas", "count", async () => { throw new Error("db down"); });
    await expect(callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
    registerMetasFakes();
    resetMetas();
  });

  test("POST:字段类型/重名/重 slug → 400;显式空 slug 存 null", async () => {
    const c = await loginAndCsrf();
    const post = (body: unknown) => callAdmin(createCategory, { cookie: c, body });
    await expect(post({ name: 123, csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类名称格式错误" });
    await expect(post({ name: "x", slug: [], csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类标识格式错误" });
    await expect(post({ name: "x", desc: 5, csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类描述格式错误" });
    await expect(post({ name: "分类甲", csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类名称已存在" });
    await expect(post({ name: "另一个", slug: "cat-a", csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "分类标识已存在" });
    const created = (await post({ name: "空标识分类", slug: "  ", csrfToken: CSRF_TOKEN })) as { data: Record<string, unknown> };
    expect(created.data.slug).toBeNull();
  });

  test("POST:未知异常 → 500", async () => {
    const c = await loginAndCsrf();
    sharedFake.on("metas", "create", async () => { throw new Error("db down"); });
    await expect(callAdmin(createCategory, { cookie: c, body: { name: "新分类", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 500 });
    registerMetasFakes();
    resetMetas();
  });

  test("异常映射:P2025→404、P2002→400", async () => {
    const c = await loginAndCsrf();
    const putBody = { name: "分类甲", csrfToken: CSRF_TOKEN };
    const put = () => callAdmin(updateCategory, { method: "PUT", params: { id: "2" }, cookie: c, body: putBody });
    const post = () => callAdmin(createCategory, { cookie: c, body: { name: "新分类", csrfToken: CSRF_TOKEN } });
    const del = () => callAdmin(deleteCategory, { method: "DELETE", params: { id: "2" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } });

    // update / delete 的唯一约束与并发删除映射
    sharedFake.on("metas", "update", async () => { throw Object.assign(new Error("P2002"), { code: "P2002" }); });
    await expect(put()).rejects.toMatchObject({ statusCode: 400, message: "分类名称或标识(slug)已存在" });
    sharedFake.on("metas", "create", async () => { throw Object.assign(new Error("P2002"), { code: "P2002" }); });
    await expect(post()).rejects.toMatchObject({ statusCode: 400, message: "分类名称或标识已存在" });
    sharedFake.on("metas", "delete", async () => { throw Object.assign(new Error("P2025"), { code: "P2025" }); });
    resetMetas([...METAS_INITIAL, { mid: 4, name: "分类乙", slug: "cat-b", desc: null, type: "category" }]);
    registerCategoryRelationFakes();
    await expect(del()).rejects.toMatchObject({ statusCode: 404 });

    registerMetasFakes();
    resetMetas();
  });

  test("GET 列表:500 分支", async () => {
    sharedFake.on("metas", "findMany", async () => { throw new Error("db down"); });
    await expect(callAdmin(getCategories, { method: "GET", cookie: await loginSessionCookie() })).rejects.toMatchObject({ statusCode: 500 });
    registerMetasFakes();
    resetMetas();
  });
});
