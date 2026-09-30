import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface TravelRow { id: number; name: string; desc: string | null; cover: string | null; longitude: number; latitude: number; sort: number; enabled: boolean }
let travels: TravelRow[] = [];
const travelCalls: string[] = [];

sharedFake.on("travels", "create", async ({ data }: { data: Omit<TravelRow, "id"> }) => {
  travelCalls.push("create");
  const row: TravelRow = { id: travels.length + 10, ...data };
  travels.push(row);
  return { ...row };
});
sharedFake.on("travels", "findUnique", async ({ where }: { where: { id: number } }) => {
  const row = travels.find(t => t.id === where.id);
  return row ? { ...row } : null;
});
sharedFake.on("travels", "update", async ({ where, data }: { where: { id: number }; data: Partial<TravelRow> }) => {
  const row = travels.find(t => t.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  Object.assign(row, data);
  return { ...row };
});
sharedFake.on("travels", "delete", async ({ where }: { where: { id: number } }) => {
  const i = travels.findIndex(t => t.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  travels.splice(i, 1);
  return {};
});
sharedFake.on("contenttravels", "createMany", async ({ data }: { data: Array<{ travel_id: number; cid: number }> }) => {
  travelCalls.push(`link:${data.map(d => d.cid).join(",")}`);
  return { count: data.length };
});

const postHandler = (await import("#server/api/admin/travels.post")).default;
const putHandler = (await import("#server/api/admin/travels/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/travels/[id].delete")).default;

beforeEach(() => {
  travels = [{ id: 1, name: "旧地点", desc: null, cover: null, longitude: 117.2, latitude: 39.1, sort: 0, enabled: true }];
  travelCalls.length = 0;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

const validBody = { name: "新地点", longitude: 117.2, latitude: 39.13, csrfToken: CSRF_TOKEN };

describe("admin/travels.post", () => {
  test("未登录 → 401;CSRF 缺失 → 403", async () => {
    await expect(callAdmin(postHandler, { body: validBody })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(postHandler, { cookie: session, body: validBody })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name 空/经纬度缺失/越界/sort 浮点 → 400", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, name: "" } })).rejects.toMatchObject({ statusCode: 400, message: "名称不能为空" });
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, longitude: undefined } })).rejects.toMatchObject({ statusCode: 400, message: "经纬度不能为空" });
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, longitude: 200 } })).rejects.toMatchObject({ statusCode: 400, message: "经纬度范围不正确" });
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, latitude: -91 } })).rejects.toMatchObject({ statusCode: 400, message: "经纬度范围不正确" });
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, sort: 3.5 } })).rejects.toMatchObject({ statusCode: 400, message: "参数格式不正确" });
  });

  test("desc/cover 非字符串 → 400", async () => {
    const c = await cookie();
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, desc: 123 } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(postHandler, { cookie: c, body: { ...validBody, cover: true } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("创建成功(默认启用);cids 写关联", async () => {
    await expect(callAdmin(postHandler, { cookie: await cookie(), body: { ...validBody, cids: [10, 20] } })).resolves.toEqual({ success: true });
    expect(travels.find(t => t.name === "新地点")?.enabled).toBe(true);
    expect(travelCalls.some(c => c.startsWith("link:10,20"))).toBe(true);
  });

  test("cids 含无效文章 → P2003 外键失败映射 400", async () => {
    // fake createMany 模拟外键失败
    sharedFake.on("contenttravels", "createMany", async () => {
      throw Object.assign(new Error("P2003"), { code: "P2003" });
    });
    await expect(callAdmin(postHandler, { cookie: await cookie(), body: { ...validBody, cids: [999] } })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的文章关联" });
  });
});

describe("admin/travels [id].put / delete", () => {
  test("PUT:404 不存在;更新成功", async () => {
    const c = await cookie();
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "999" }, cookie: c, body: { ...validBody } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody, name: "改名地点" } })).resolves.toBeTruthy();
    expect(travels.find(t => t.id === 1)?.name).toBe("改名地点");
  });

  test("DELETE:成功;404 重复删除", async () => {
    const c = await cookie();
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).resolves.toBeTruthy();
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: { "x-csrf-token": CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// 文件级 beforeEach 不会在每个 test 前重设 handler(handler 表按最后注册者胜,跨文件共享),
// 破坏性注册(抛错替身)会污染同文件后续用例,故用完显式恢复。
function restoreTravelsFakes(): void {
  sharedFake.on("travels", "create", async ({ data }: { data: Omit<TravelRow, "id"> }) => {
    travelCalls.push("create");
    const row: TravelRow = { id: travels.length + 10, ...data };
    travels.push(row);
    return { ...row };
  });
  sharedFake.on("travels", "findUnique", async ({ where }: { where: { id: number } }) => {
    const row = travels.find(t => t.id === where.id);
    return row ? { ...row } : null;
  });
  sharedFake.on("travels", "update", async ({ where, data }: { where: { id: number }; data: Partial<TravelRow> }) => {
    const row = travels.find(t => t.id === where.id);
    if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
    Object.assign(row, data);
    return { ...row };
  });
  sharedFake.on("travels", "delete", async ({ where }: { where: { id: number } }) => {
    const i = travels.findIndex(t => t.id === where.id);
    if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
    travels.splice(i, 1);
    return {};
  });
  sharedFake.on("contenttravels", "deleteMany", async () => ({ count: 0 }));
  sharedFake.on("contenttravels", "createMany", async ({ data }: { data: Array<{ travel_id: number; cid: number }> }) => {
    travelCalls.push(`link:${data.map(d => d.cid).join(",")}`);
    return { count: data.length };
  });
}

describe("admin/travels 分支补测", () => {
  test("PUT:401/400/403 前置校验矩阵", async () => {
    restoreTravelsFakes();
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, body: validBody })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "abc" }, cookie: c, body: validBody })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "0" }, cookie: c, body: validBody })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: session, body: validBody })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("PUT:字段校验矩阵(名称/desc/cover/经纬度/sort) → 400", async () => {
    restoreTravelsFakes();
    const c = await cookie();
    const put = (body: Record<string, unknown>) => callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, ...body } });
    await expect(put({ name: 123, longitude: 1, latitude: 1 })).rejects.toMatchObject({ statusCode: 400, message: "名称不能为空" });
    await expect(put({ name: "  ", longitude: 1, latitude: 1 })).rejects.toMatchObject({ statusCode: 400, message: "名称不能为空" });
    await expect(put({ ...validBody, desc: 5 })).rejects.toMatchObject({ statusCode: 400, message: "简介格式错误" });
    await expect(put({ ...validBody, cover: [] })).rejects.toMatchObject({ statusCode: 400, message: "封面格式错误" });
    await expect(put({ name: "x", csrfToken: CSRF_TOKEN })).rejects.toMatchObject({ statusCode: 400, message: "经纬度不能为空" });
    await expect(put({ name: "x", longitude: "abc", latitude: 1 })).rejects.toMatchObject({ statusCode: 400, message: "经纬度不能为空" });
    await expect(put({ name: "x", longitude: 200, latitude: 1 })).rejects.toMatchObject({ statusCode: 400, message: "经纬度范围不正确" });
    await expect(put({ name: "x", longitude: 1, latitude: 99 })).rejects.toMatchObject({ statusCode: 400, message: "经纬度范围不正确" });
    await expect(put({ ...validBody, sort: 3.5 })).rejects.toMatchObject({ statusCode: 400, message: "参数格式不正确" });
  });

  test("PUT:部分更新只写显式字段;cids 全量同步并去重", async () => {
    restoreTravelsFakes();
    const c = await cookie();
    const r = (await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { csrfToken: CSRF_TOKEN, name: "改名地点", longitude: 118, latitude: 32, cids: [7, 7, "8", 0, -1] } })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(travels[0]!.name).toBe("改名地点");
    expect(travels[0]!.desc).toBeNull();
    expect(travelCalls.filter(x => x.startsWith("link:")).at(-1)).toBe("link:7,8");
  });

  test("PUT:cids 传空数组 → 清空关联;非数组 → 视为空", async () => {
    restoreTravelsFakes();
    const c = await cookie();
    await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody, cids: "x" } });
    expect(travelCalls.some(x => x.startsWith("link:"))).toBe(false);
    await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody, cids: [] } });
    expect(travelCalls.some(x => x.startsWith("link:"))).toBe(false);
  });

  test("PUT:enabled 显式传递才更新;不传则保留原值", async () => {
    restoreTravelsFakes();
    const c = await cookie();
    await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody, enabled: false } });
    expect(travels[0]!.enabled).toBe(false);
    // 不传 enabled → 保持 false(不被翻回 true)
    await callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody } });
    expect(travels[0]!.enabled).toBe(false);
  });

  test("PUT:并发删除 → 404;外键 → 400;未知 → 500", async () => {
    restoreTravelsFakes();
    const c = await cookie();

    sharedFake.on("travels", "update", async () => { throw Object.assign(new Error("P2025"), { code: "P2025" }); });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: validBody })).rejects.toMatchObject({ statusCode: 404 });

    restoreTravelsFakes();
    sharedFake.on("contenttravels", "createMany", async () => { throw Object.assign(new Error("P2003"), { code: "P2003" }); });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: { ...validBody, cids: [9] } })).rejects.toMatchObject({ statusCode: 400, message: "存在无效的文章关联" });

    restoreTravelsFakes();
    sharedFake.on("travels", "findUnique", async () => { throw new Error("db down"); });
    await expect(callAdmin(putHandler, { method: "PUT", params: { id: "1" }, cookie: c, body: validBody })).rejects.toMatchObject({ statusCode: 500 });
    restoreTravelsFakes();
  });

  test("DELETE:401/400/403/404/500", async () => {
    restoreTravelsFakes();
    const session = await loginSessionCookie();
    const c = `${session}; ${CSRF_COOKIE}`;
    const h = { "x-csrf-token": CSRF_TOKEN };
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, headers: h })).rejects.toMatchObject({ statusCode: 401 });
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "abc" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 400 });
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: session, headers: h })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "999" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 404 });

    sharedFake.on("travels", "delete", async () => { throw new Error("db down"); });
    await expect(callAdmin(deleteHandler, { method: "DELETE", params: { id: "1" }, cookie: c, headers: h })).rejects.toMatchObject({ statusCode: 500 });
  });
});
