/**
 * admin/contents/[cid]/autosave PATCH:草稿云端同步。
 * 回归:曾对任意状态放行 → 已发布文章被 30s 定时器用半成品正文覆盖线上,且不失效 ISR。
 * 现契约:仅 status=0 草稿可同步;content 缺省只推进 update_time;status 永不被改动。
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

interface DraftRow {
  cid: number;
  status: number;
  content: string | null;
  update_time: Date;
}
let rows: DraftRow[] = [];
const updateCalls: Array<{ where: { cid: number }; data: Record<string, unknown> }> = [];

sharedFake.on("contents", "findFirst", async ({ where }: { where: { cid: number } }) => {
  const row = rows.find(r => r.cid === where.cid);
  return row ? { ...row } : null;
});
sharedFake.on("contents", "update", async ({ where, data }: { where: { cid: number }; data: Record<string, unknown> }) => {
  const row = rows.find(r => r.cid === where.cid);
  if (!row) throw Object.assign(new Error("P2025"), { code: "P2025" });
  updateCalls.push({ where, data });
  Object.assign(row, data);
  return { cid: row.cid, update_time: row.update_time };
});

const handler = (await import("#server/api/admin/contents/[cid]/autosave.patch")).default;

beforeEach(() => {
  rows = [
    { cid: 10, status: 0, content: "旧稿", update_time: new Date("2026-01-01T00:00:00Z") },
    { cid: 20, status: 1, content: "线上正文", update_time: new Date("2026-01-01T00:00:00Z") },
  ];
  updateCalls.length = 0;
});

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/contents/[cid]/autosave.patch", () => {
  test("未登录 → 401;CSRF 缺失 → 403;非法 cid → 400", async () => {
    await expect(callAdmin(handler, { method: "PATCH", params: { cid: "10" }, body: { content: "x" } })).rejects.toMatchObject({ statusCode: 401 });
    const session = await loginSessionCookie();
    await expect(callAdmin(handler, { method: "PATCH", params: { cid: "10" }, cookie: session, body: { content: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(callAdmin(handler, { method: "PATCH", params: { cid: "abc" }, cookie: await cookie(), body: { content: "x", csrfToken: CSRF_TOKEN } })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("草稿(status=0)同步正文 → 成功;只写 content+update_time,不碰 status", async () => {
    const r = (await callAdmin(handler, {
      method: "PATCH", params: { cid: "10" }, cookie: await cookie(),
      body: { content: "新稿正文", csrfToken: CSRF_TOKEN },
    })) as { success: boolean; data: { cid: number } };
    expect(r.success).toBe(true);
    expect(r.data.cid).toBe(10);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]!.data.content).toBe("新稿正文");
    expect(updateCalls[0]!.data.update_time).toBeInstanceOf(Date);
    expect("status" in updateCalls[0]!.data).toBe(false);
  });

  test("回归:已发布(status=1)→ 409 拒绝,正文不被覆盖", async () => {
    await expect(callAdmin(handler, {
      method: "PATCH", params: { cid: "20" }, cookie: await cookie(),
      body: { content: "半成品", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(updateCalls.length).toBe(0);
    expect(rows.find(r => r.cid === 20)!.content).toBe("线上正文");
  });

  test("content 缺省(null/undefined)→ 只推进 update_time,不覆盖正文", async () => {
    const r = (await callAdmin(handler, {
      method: "PATCH", params: { cid: "10" }, cookie: await cookie(),
      body: { content: null, csrfToken: CSRF_TOKEN },
    })) as { success: boolean };
    expect(r.success).toBe(true);
    expect(updateCalls[0]!.data).not.toHaveProperty("content");
    expect(updateCalls[0]!.data.update_time).toBeInstanceOf(Date);
  });

  test("content 非字符串 → 400", async () => {
    await expect(callAdmin(handler, {
      method: "PATCH", params: { cid: "10" }, cookie: await cookie(),
      body: { content: 123, csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("文章不存在 → 404", async () => {
    await expect(callAdmin(handler, {
      method: "PATCH", params: { cid: "999" }, cookie: await cookie(),
      body: { content: "x", csrfToken: CSRF_TOKEN },
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});
