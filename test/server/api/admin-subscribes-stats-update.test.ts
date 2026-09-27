/**
 * server/api/admin/subscribes/{stats.get,update.post}.ts:
 *  - stats:未登录 401;已登录调 getSubscriptionStats() 返对象
 *  - update:未登录 401;CSRF 失败 403;
 *    调 updateAllSubscribes() fire-and-forget(不等完成),返 {success:true, data:{started:true}}
 */
import "#test/helpers/nitro-globals";

import { beforeEach, describe, expect, mock, test } from "bun:test";

let getUserImpl: (e: unknown) => Promise<unknown>;
let getSubscriptionStatsImpl: () => unknown;
let updateAllSubscribesCalls: number;

beforeEach(() => {
  getUserImpl = async () => ({ uid: 1 });
  getSubscriptionStatsImpl = () => ({
    updateCount: 5,
    lastUpdateAt: 1234567890,
    successCount: 4,
    failureCount: 1,
  });
  updateAllSubscribesCalls = 0;
  mock.module("#server/lib/auth", () => ({
    getUser: async (e: unknown) => getUserImpl(e),
  }));
  mock.module("#server/utils/rss", () => ({
    getSubscriptionStats: () => getSubscriptionStatsImpl(),
    updateAllSubscribes: async () => { updateAllSubscribesCalls++; return { updated: 3 }; },
  }));
  mock.module("#server/utils/csrf", () => ({
    validateCsrfToken: () => true,
    ensureCsrfToken: () => "csrf",
    getStoredCsrfToken: () => null,
    setCsrfToken: () => "csrf",
    generateCsrfToken: () => "csrf",
  }));
});

const { default: statsHandler } = await import("~/../server/api/admin/subscribes/stats.get");
const { default: updateHandler } = await import("~/../server/api/admin/subscribes/update.post");

function callStats(): Promise<unknown> {
  return (statsHandler as (e: never) => Promise<unknown>)({} as never);
}

function callUpdate(body?: unknown): Promise<unknown> {
  return (updateHandler as (e: never) => Promise<unknown>)({
    method: "POST",
    path: "/api/admin/subscribes/update",
    _requestBody: body === undefined ? undefined : JSON.stringify(body),
    node: {
      req: { method: "POST", url: "/api/admin/subscribes/update", headers: body === undefined ? {} : { "content-type": "application/json" } },
      res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) },
    },
  } as never);
}

describe("admin subscribes/stats:get", () => {
  test("未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(callStats()).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 调 getSubscriptionStats 返对象", async () => {
    const res = await callStats() as { updateCount: number; lastUpdateAt: number };
    expect(res.updateCount).toBe(5);
    expect(res.lastUpdateAt).toBe(1234567890);
  });
});

describe("admin subscribes/update:post", () => {
  test("未登录 → 401", async () => {
    getUserImpl = async () => null;
    await expect(callUpdate({ csrfToken: "x" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 失败 → 403", async () => {
    mock.module("#server/utils/csrf", () => ({
      validateCsrfToken: () => false,
      ensureCsrfToken: () => "csrf",
      getStoredCsrfToken: () => null,
      setCsrfToken: () => "csrf",
      generateCsrfToken: () => "csrf",
    }));
    const { default: h } = await import("~/../server/api/admin/subscribes/update.post");
    await expect((h as (e: never) => Promise<unknown>)({
      method: "POST",
      _requestBody: JSON.stringify({ csrfToken: "x" }),
      node: { req: { method: "POST", headers: { "content-type": "application/json" } }, res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) } },
    } as never)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功 → fire-and-forget 调 updateAllSubscribes,立即返 {success, data:{started:true}}", async () => {
    const res = await callUpdate({ csrfToken: "x" }) as { success: boolean; data: { started: boolean } };
    expect(res.success).toBe(true);
    expect(res.data.started).toBe(true);
    expect(updateAllSubscribesCalls).toBe(1);
  });

  test("updateAllSubscribes 抛错 → handler 不外抛(后台 fire-and-forget)", async () => {
    mock.module("#server/utils/rss", () => ({
      getSubscriptionStats: () => ({}),
      updateAllSubscribes: async () => { throw new Error("RSS fetch failed"); },
    }));
    const { default: h } = await import("~/../server/api/admin/subscribes/update.post");
    const origErr = console.error;
    console.error = () => {};
    try {
      const res = await (h as (e: never) => Promise<unknown>)({
        method: "POST",
        _requestBody: JSON.stringify({ csrfToken: "x" }),
        node: { req: { method: "POST", headers: { "content-type": "application/json" } }, res: { setHeader() {}, getHeader: () => undefined, getHeaders: () => ({}) } },
      } as never) as { success: boolean };
      expect(res.success).toBe(true);
    } finally {
      console.error = origErr;
    }
  });
});