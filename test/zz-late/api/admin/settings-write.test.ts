import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER as _CSRF_HEADER } from "#shared/constants";
void _CSRF_HEADER;

const fakePrisma = await import("#test/helpers/fake-prisma");

// ===== informations 假件 =====
const informationRows: Array<{ key: string, value: string }> = [];
let createdManyItems: Array<Record<string, unknown>> = [];

fakePrisma.sharedFake.on("informations", "findMany", async () =>
  informationRows.map(r => ({ ...r })));
fakePrisma.sharedFake.on("informations", "createMany", async ({ data, skipDuplicates }: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => {
    createdManyItems.push(...data);
    if (!skipDuplicates) {
      // 模拟 insert;不重复
      for (const d of data) {
        if (!informationRows.some(r => r.key === d.key)) informationRows.push(d as { key: string, value: string });
      }
    }
    return { count: data.length };
  });
fakePrisma.sharedFake.on("informations", "upsert", async ({ where, update }: { where: { key: string }, update: Record<string, unknown> }) => {
  const row = informationRows.find(r => r.key === where.key);
  if (row) Object.assign(row, update);
  else informationRows.push({ key: where.key, value: update.value as string });
  return { key: where.key, value: update.value };
});
fakePrisma.sharedFake.on("informations", "updateMany", async ({ where, data }: { where: { key: string }, data: Record<string, unknown> }) => {
  let count = 0;
  for (const r of informationRows) {
    if (r.key === where.key) {
      Object.assign(r, data);
      count++;
    }
  }
  return { count };
});

const settingsInitHandler = (await import("#server/api/admin/settings/init.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  informationRows.length = 0;
  createdManyItems = [];
});

describe("settings/init.post(初始化配置)", () => {
  test("非 POST → 405", async () => {
    await expect(callAdmin(settingsInitHandler, {
      method: "GET",
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 405 });
  });

  test("未登录 → 401", async () => {
    await expect(callAdmin(settingsInitHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(settingsInitHandler, {
      method: "POST",
      body: {},
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("空 informations → 初始化所有默认配置", async () => {
    const r = await callAdmin(settingsInitHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, message: string, data: { created: unknown[], total: number } };
    expect(r.success).toBe(true);
    expect(r.data.created.length).toBeGreaterThan(0);
    expect(r.data.total).toBeGreaterThan(0);
    expect(r.message).toContain("已初始化");
  });

  test("已有配置 → 不重复创建", async () => {
    // 先填一个 siteName
    informationRows.push({ key: "siteName", value: "custom" });
    const r = await callAdmin(settingsInitHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean, data: { created: unknown[] } };
    expect(r.success).toBe(true);
    // created 数组应不含 siteName(已存在)
    const createdKeys = (r.data.created as Array<{ key: string }>).map(c => c.key);
    expect(createdKeys).not.toContain("siteName");
  });
});
