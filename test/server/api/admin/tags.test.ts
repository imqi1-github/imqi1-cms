import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie, registerMetasFakes, resetMetas } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// metas 表假件统一在 test/helpers/admin.ts 注册,这里只复位到统一初值
beforeEach(() => { registerMetasFakes(); resetMetas(); });

const getTags = (await import("#server/api/admin/tags.get")).default;
const createTag = (await import("#server/api/admin/tags.post")).default;
const updateTag = (await import("#server/api/admin/tags/[id].put")).default;
const deleteTag = (await import("#server/api/admin/tags/[id].delete")).default;

describe("admin/tags 四件套:鉴权与 CSRF 四层防线", () => {
  test("未登录 → 401(GET 无 cookie)", async () => {
    await expect(callAdmin(getTags, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  test("POST 登录但无 csrf_token cookie → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(createTag, { cookie: session, body: { name: "x" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("POST 有 cookie 但 body token 不匹配 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(createTag, { cookie: `${session}; ${CSRF_COOKIE}`, body: { name: "x", csrfToken: "wrong-token-here!!!" } })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("DELETE 的 CSRF 走 x-csrf-token header(不进 body)", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(deleteTag, { method: "DELETE", params: { id: "3" }, cookie: session })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(deleteTag, { method: "DELETE", params: { id: "3" }, cookie: `${session}; ${CSRF_COOKIE}`, headers: { "x-csrf-token": CSRF_TOKEN } })).resolves.toMatchObject({ success: true });
  });
});

describe("admin/tags:校验与业务分支", () => {
  beforeEach(() => resetMetas());

  test("POST name 空/非字符串 → 400", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(createTag, { cookie, body: { name: "", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(createTag, { cookie, body: { name: 123, csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(createTag, { cookie, body: { name: "长".repeat(101), csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("POST 创建成功并出现在 GET 列表", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; ${CSRF_COOKIE}`;
    const created = await callAdmin(createTag, { cookie, body: { name: "新标签", slug: "new-tag", desc: "描述", csrfToken: CSRF_TOKEN } });
    expect(created).toMatchObject({ name: "新标签", slug: "new-tag", type: "tag" });
    const list = (await callAdmin(getTags, { method: "GET", cookie: session })) as Array<Record<string, unknown>>;
    const row = list.find(t => t.name === "新标签");
    expect(row).toBeTruthy();
    expect(Object.keys(row!).sort()).toEqual(["contentCount", "desc", "mid", "name", "slug", "type"]);
  });

  test("POST 重名 → P2002 映射 400", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(createTag, { cookie: `${session}; ${CSRF_COOKIE}`, body: { name: "标签甲", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("PUT:无效 id → 400;updateMany 不命中(type 隔离或不存在)→ 404;命中 → 更新且白名单返回", async () => {
    const session = await loginSessionCookie();
    const cookie = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(updateTag, { method: "PUT", params: {}, cookie, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(updateTag, { method: "PUT", params: { id: "abc" }, cookie, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
    // mid=2 是分类:updateMany 限定 type='tag',不误改同表分类
    await expect(callAdmin(updateTag, { method: "PUT", params: { id: "2" }, cookie, body: { name: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
    const updated = await callAdmin(updateTag, { method: "PUT", params: { id: "1" }, cookie, body: { name: "改名标签", csrfToken: CSRF_TOKEN } }) as Record<string, unknown>;
    expect(updated).toMatchObject({ mid: 1, name: "改名标签", type: "tag" });
    expect(Object.keys(updated).sort()).toEqual(["desc", "mid", "name", "slug", "type"]);
  });

  test("DELETE:不存在 → 404;type=category → 400 只能删标签;删除后 GET 少一条", async () => {
    const session = await loginSessionCookie();
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteTag, { method: "DELETE", params: { id: "999" }, cookie: `${session}; ${CSRF_COOKIE}`, headers: h })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(deleteTag, { method: "DELETE", params: { id: "2" }, cookie: `${session}; ${CSRF_COOKIE}`, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await callAdmin(deleteTag, { method: "DELETE", params: { id: "1" }, cookie: `${session}; ${CSRF_COOKIE}`, headers: h });
    const list = (await callAdmin(getTags, { method: "GET", cookie: session })) as Array<Record<string, unknown>>;
    expect(list.find(t => t.mid === 1)).toBeUndefined();
  });
});
