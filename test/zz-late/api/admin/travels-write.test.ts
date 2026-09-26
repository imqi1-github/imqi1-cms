import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// travels 表假件
const travelRows: Array<Record<string, unknown>> = [];
const travelCreates: Array<Record<string, unknown>> = [];
const travelUpdates: Array<{ id: number, data: Record<string, unknown> }> = [];
const travelDeletes: number[] = [];
const contentTravelCreates: Array<Record<string, unknown>> = [];

fakePrisma.sharedFake.on("travels", "create", async ({ data }: { data: Record<string, unknown> }) => {
  travelCreates.push({ ...data });
  const id = travelRows.length + 1;
  const row = { id, ...data };
  travelRows.push(row);
  return { ...row };
});
fakePrisma.sharedFake.on("travels", "findUnique", async ({ where }: { where: { id: number } }) =>
  travelRows.find(r => r.id === where.id) ?? null);
fakePrisma.sharedFake.on("travels", "update", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
  const row = travelRows.find(r => r.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  travelUpdates.push({ id: where.id, data });
  Object.assign(row, data);
  return { id: where.id, ...data };
});
fakePrisma.sharedFake.on("travels", "delete", async ({ where }: { where: { id: number } }) => {
  const i = travelRows.findIndex(r => r.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  travelDeletes.push(where.id);
  travelRows.splice(i, 1);
  return {};
});
fakePrisma.sharedFake.on("contenttravels", "createMany", async ({ data }: { data: Array<Record<string, unknown>> }) => {
  contentTravelCreates.push(...data);
  return { count: data.length };
});
fakePrisma.sharedFake.on("contenttravels", "deleteMany", async () => ({ count: 0 }));

const createHandler = (await import("#server/api/admin/travels.post")).default;
const putHandler = (await import("#server/api/admin/travels/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/travels/[id].delete")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  travelRows.length = 0;
  travelRows.push({ id: 1, name: "故宫", longitude: 116.397, latitude: 39.918, sort: 0, enabled: true });
  travelCreates.length = 0;
  travelUpdates.length = 0;
  travelDeletes.length = 0;
  contentTravelCreates.length = 0;
});

describe("travels.post(创建地点)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { name: "x", longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: 0, latitude: 0 },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("name 空字符串 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "", longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400, message: "名称不能为空" });
  });

  test("name 非字符串 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: 123, longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("经纬度缺失 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/经纬度/);
  });

  test("经纬度非数字 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: "abc", latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/经纬度/);
  });

  test("经纬度越界 → 400", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: 200, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/范围/);
  });

  test("sort 浮点 → 400(Int 字段)", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: 0, latitude: 0, sort: 3.5, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow(/参数格式/);
  });

  test("成功:基础必填字段 → 返回 { success: true }", async () => {
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { name: "新地点", longitude: 100, latitude: 30, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(travelCreates).toHaveLength(1);
  });

  test("成功:带 cids 关联写入 contenttravels(去重)", async () => {
    await callAdmin(createHandler, {
      method: "POST",
      body: { name: "新地点", longitude: 100, latitude: 30, cids: [1, 2, 2], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    // 去重后 2 条
    expect(contentTravelCreates.length).toBe(2);
    expect(contentTravelCreates[0]).toMatchObject({ cid: 1 });
    expect(contentTravelCreates[1]).toMatchObject({ cid: 2 });
  });

  test("enabled 缺省 → 默认 true(写入 db 的值)", async () => {
    await callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect((travelCreates[0] as { enabled: boolean }).enabled).toBe(true);
  });

  test("P2003 关联 cid 不存在 → 400(不是 500)", async () => {
    // 默认 contenttravels.createMany 不会抛,这里手工制造抛错
    fakePrisma.sharedFake.on("contenttravels", "createMany", async () => {
      throw Object.assign(new Error("FK"), { code: "P2003" });
    });
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { name: "x", longitude: 0, latitude: 0, cids: [999], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("travels/[id].put", () => {
  test("非法 id → 400", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "abc" },
      body: { name: "x", longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { name: "x", longitude: 0, latitude: 0, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功更新", async () => {
    const r = await callAdmin(putHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { name: "新名", longitude: 100, latitude: 30, csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(r).toBeDefined();
    expect(travelUpdates).toHaveLength(1);
  });
});

describe("travels/[id].delete", () => {
  test("CSRF header 缺失 → 403", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("id 不存在 → 404", async () => {
    await expect(callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "999" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("成功删除", async () => {
    const r = await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(travelDeletes).toEqual([1]);
  });
});
