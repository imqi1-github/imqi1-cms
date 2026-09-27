import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// mock redis = null,触发 cache/clear.post 的「未配置 Redis」分支
mock.module("#server/utils/redis", () => ({ redis: null }));

const handler = (await import("#server/api/admin/cache/clear.post")).default;

beforeEach(() => { /* redis 固定为 null */ });

describe("admin/cache/clear.post 无 Redis 配置分支", () => {
  test("action=all → success:false matched:0 cleared:0", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean; matched: number; cleared: number; message: string };
    expect(r.success).toBe(false);
    expect(r.matched).toBe(0);
    expect(r.cleared).toBe(0);
    expect(String(r.message)).toContain("无需清理");
  });

  test("action=search → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { success: boolean };
    expect(r.success).toBe(false);
  });

  test("action=keyword → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "test" },
    }) as { success: boolean };
    expect(r.success).toBe(false);
  });

  test("action=footprint → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "footprint" },
    }) as { success: boolean };
    expect(r.success).toBe(false);
  });

  test("action=preset → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: "search" },
    }) as { success: boolean };
    expect(r.success).toBe(false);
  });

  test("无 CSRF → 403(在 redis null 检查之前)", async () => {
    const cookie = await loginSessionCookie();
    await expect(callAdmin(handler, {
      method: "POST",
      cookie,
      body: { action: "all" },
    })).rejects.toMatchObject({ statusCode: 403 });
  });
});