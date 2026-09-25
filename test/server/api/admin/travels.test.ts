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
