/**
 * server/api/admin/subscribes/stats.get.ts 集成测:
 *  - 内存统计(updateCount/lastRunAt/successCount/failureCount),无 DB 调用
 *  - 401 鉴权 + shape 校验 + rss util mock 异常路径
 */
import { describe, expect, mock, test } from "bun:test";

import { callAdmin, loginSessionCookie } from "#test/helpers/admin";

// rss 模块内含 getSubscriptionStats 是 module-scope mutable,bun 模块缓存是 process-wide,
// 其它测试可能污染。这里 mock 拿可控快照。
let statsSnapshot: { updateCount: number; lastRunAt: number | null; successCount: number; failureCount: number } = {
  updateCount: 0,
  lastRunAt: null,
  successCount: 0,
  failureCount: 0,
};
mock.module("#server/utils/rss", () => ({
  getSubscriptionStats: () => ({ ...statsSnapshot }),
}));

const handler = (await import("#server/api/admin/subscribes/stats.get")).default;

describe("admin/subscribes/stats.get(订阅统计)", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(handler, { method: "GET" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回 updateCount/lastRunAt/successCount/failureCount 字段", async () => {
    statsSnapshot = { updateCount: 42, lastRunAt: 1715000000000, successCount: 38, failureCount: 4 };
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { updateCount: number; lastRunAt: number | null; successCount: number; failureCount: number };
    expect(r.updateCount).toBe(42);
    expect(r.lastRunAt).toBe(1715000000000);
    expect(r.successCount).toBe(38);
    expect(r.failureCount).toBe(4);
  });

  test("未运行过 → 全 0(null lastRunAt)", async () => {
    statsSnapshot = { updateCount: 0, lastRunAt: null, successCount: 0, failureCount: 0 };
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as { updateCount: number; lastRunAt: number | null };
    expect(r.updateCount).toBe(0);
    expect(r.lastRunAt).toBeNull();
  });

  test("响应不外泄内部字段(如 isRunning / runQueue)", async () => {
    statsSnapshot = { updateCount: 1, lastRunAt: 1, successCount: 1, failureCount: 0 };
    const cookie = await loginSessionCookie();
    const r = await callAdmin(handler, { method: "GET", cookie }) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(["failureCount", "lastRunAt", "successCount", "updateCount"]);
  });
});