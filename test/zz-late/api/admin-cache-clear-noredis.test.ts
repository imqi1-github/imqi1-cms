import { beforeEach, describe, expect, mock, test } from "bun:test";

import { CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// mock redis = null：短期缓存（搜索/足迹/限流）落进程内内存，页面缓存走文件驱动
mock.module("#server/utils/redis", () => ({ redis: null }));

const handler = (await import("#server/api/admin/cache/clear.post")).default;

beforeEach(() => { /* redis 固定为 null */ });

describe("admin/cache/clear.post 无 Redis 配置分支", () => {
  test("action=all → 清源站缓存并触发边缘刷新，matched=-1", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "all" },
    }) as { success: boolean; matched: number; cleared: number; note?: string };
    expect(r.success).toBe(true);
    expect(r.matched).toBe(-1);
    expect(r.cleared).toBe(-1);
  });

  test("action=search → 走进程内内存清理", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "search" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("action=keyword → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "keyword", value: "test" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("action=footprint → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "footprint" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
  });

  test("action=preset → 同上", async () => {
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, {
      method: "POST",
      cookie: cookie + "; csrf_token=" + CSRF_TOKEN,
      body: { csrfToken: CSRF_TOKEN, action: "preset", value: "search" },
    }) as { success: boolean };
    expect(r.success).toBe(true);
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
