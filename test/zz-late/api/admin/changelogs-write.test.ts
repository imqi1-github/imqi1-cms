import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { CSRF_HEADER } from "#shared/constants";

const fakePrisma = await import("#test/helpers/fake-prisma");

// changelogs 表假件
const changelogRows: Array<Record<string, unknown>> = [];
const changelogCreates: Array<Record<string, unknown>> = [];
const changelogUpdates: Array<{ id: number, data: Record<string, unknown> }> = [];
const changelogDeletes: number[] = [];
const batchDeleted: Array<{ id: { in: number[] } }> = [];

fakePrisma.sharedFake.on("changelogs", "create", async ({ data }: { data: Record<string, unknown> }) => {
  changelogCreates.push({ ...data });
  const id = changelogRows.length + 1;
  const row = { id, ...data, create_time: new Date() };
  changelogRows.push(row);
  return { ...row };
});
fakePrisma.sharedFake.on("changelogs", "findUnique", async ({ where }: { where: { id: number } }) =>
  changelogRows.find(r => r.id === where.id) ?? null);
fakePrisma.sharedFake.on("changelogs", "update", async ({ where, data }: { where: { id: number }, data: Record<string, unknown> }) => {
  const row = changelogRows.find(r => r.id === where.id);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  changelogUpdates.push({ id: where.id, data });
  Object.assign(row, data);
  return { ...row };
});
fakePrisma.sharedFake.on("changelogs", "delete", async ({ where }: { where: { id: number } }) => {
  const i = changelogRows.findIndex(r => r.id === where.id);
  if (i === -1) throw Object.assign(new Error("P2025"), { code: "P2025" });
  changelogDeletes.push(where.id);
  changelogRows.splice(i, 1);
  return {};
});
fakePrisma.sharedFake.on("changelogs", "deleteMany", async ({ where }: { where: { id: { in: number[] } } }) => {
  batchDeleted.push(where);
  const before = changelogRows.length;
  const ids = where.id.in;
  for (let i = changelogRows.length - 1; i >= 0; i--) {
    if (ids.includes(changelogRows[i]!.id as number)) changelogRows.splice(i, 1);
  }
  return { count: before - changelogRows.length };
});

const createHandler = (await import("#server/api/admin/changelogs.post")).default;
const putHandler = (await import("#server/api/admin/changelogs/[id].put")).default;
const deleteHandler = (await import("#server/api/admin/changelogs/[id].delete")).default;
const batchDeleteHandler = (await import("#server/api/admin/changelogs/batch-delete.post")).default;

async function cookie() {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

beforeEach(() => {
  changelogRows.length = 0;
  changelogRows.push({ id: 1, content: JSON.stringify([{ type: "修复", value: "x" }]), create_time: new Date() });
  changelogRows.push({ id: 2, content: JSON.stringify([{ type: "功能", value: "y" }]), create_time: new Date() });
  changelogCreates.length = 0;
  changelogUpdates.length = 0;
  changelogDeletes.length = 0;
  batchDeleted.length = 0;
});

describe("changelogs.post(创建单条)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      cookie: CSRF_COOKIE,
      body: { content: [], csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(createHandler, {
      method: "POST",
      body: { content: [] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功:content 是 [{type,value}]", async () => {
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { content: [{ type: "修复", value: "**bug**" }], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
    expect(changelogCreates).toHaveLength(1);
  });

  test("content 非数组被规范化器兜底成空数组", async () => {
    // normalizeChangelogEntries 对非数组宽容(空 entries),source 实际不抛;
    // 这里固化真实行为作为将来修 bug 的对照。
    const r = await callAdmin(createHandler, {
      method: "POST",
      body: { content: "string", csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });
});

describe("changelogs/[id].put", () => {
  test("id 不存在 → 404", async () => {
    await expect(callAdmin(putHandler, {
      method: "PUT",
      params: { id: "999" },
      body: { content: [], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })).rejects.toThrow();
  });

  test("成功更新", async () => {
    await callAdmin(putHandler, {
      method: "PUT",
      params: { id: "1" },
      body: { content: [{ type: "修复", value: "更新后" }], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(changelogUpdates).toHaveLength(1);
  });
});

describe("changelogs/[id].delete", () => {
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
    })).rejects.toThrow();
  });

  test("成功删除", async () => {
    await callAdmin(deleteHandler, {
      method: "DELETE",
      params: { id: "1" },
      cookie: await cookie(),
      headers: { [CSRF_HEADER]: CSRF_TOKEN },
    });
    expect(changelogDeletes).toEqual([1]);
  });
});

describe("changelogs/batch-delete.post", () => {
  test("CSRF 缺失 → 403", async () => {
    await expect(callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1, 2] },
      cookie: await cookie(),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功批量删除", async () => {
    await callAdmin(batchDeleteHandler, {
      method: "POST",
      body: { ids: [1, 2], csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    });
    expect(batchDeleted).toHaveLength(1);
    expect(batchDeleted[0]!.id.in).toEqual([1, 2]);
    expect(changelogRows).toHaveLength(0);
  });
});
