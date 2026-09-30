/**
 * admin/subscribes/stats.get + update.post 补测:
 *  - 401 守卫
 *  - update.post:401/CSRF 守卫
 *  - update.post 触发后台任务(立即返回,不等抓取)
 *  - 失败仅日志,不抛给前端(任务异常被吞)
 */
import { describe, expect, mock, test } from "bun:test";

import { CSRF_COOKIE, CSRF_TOKEN, callAdmin, loginSessionCookie } from "#test/helpers/admin";
import { mockSharedPrisma } from "#test/helpers/fake-prisma";

mockSharedPrisma();

const statsHandler = (await import("#server/api/admin/subscribes/stats.get")).default;
const updateHandler = (await import("#server/api/admin/subscribes/update.post")).default;

async function cookie(): Promise<string> {
  return `${await loginSessionCookie()}; ${CSRF_COOKIE}`;
}

describe("admin/subscribes/stats.get", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(statsHandler, { method: "GET", cookie: "" })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("已登录 → 返回 getSubscriptionStats() 内存统计(数字)", async () => {
    const r = (await callAdmin(statsHandler, {
      method: "GET",
      cookie: await cookie(),
    })) as { updateCount?: number; successCount?: number; failureCount?: number; lastRunAt?: string };
    expect(typeof r.updateCount).toBe("number");
    expect(typeof r.successCount).toBe("number");
    expect(typeof r.failureCount).toBe("number");
  });
});

describe("admin/subscribes/update.post", () => {
  test("未登录 → 401", async () => {
    await expect(callAdmin(updateHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: "",
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("CSRF 缺失 → 403", async () => {
    const session = await loginSessionCookie();
    await expect(callAdmin(updateHandler, {
      method: "POST",
      body: {},
      cookie: session,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("成功 → 立即返回 { success, started: true },触发 updateAllSubscribes", async () => {
    let called = false;
    mock.module("#server/utils/rss", () => ({
      getSubscriptionStats: () => ({ totalRuns: 0, success: 0, failed: 0 }),
      updateAllSubscribes: async () => {
        called = true;
        return { success: 0, total: 0 };
      },
    }));
    // 重新导入 handler 以获取新 mock
    const { default: freshHandler } = await import("#server/api/admin/subscribes/update.post");
    const r = (await callAdmin(freshHandler, {
      method: "POST",
      body: { csrfToken: CSRF_TOKEN },
      cookie: await cookie(),
    })) as { success: boolean; data: { started: boolean } };
    expect(r.success).toBe(true);
    expect(r.data.started).toBe(true);
    // updateAllSubscribes 是 void + .catch,异步触发,等待一帧
    await new Promise(r => setTimeout(r, 10));
    expect(called).toBe(true);
  });

  test("updateAllSubscribes 抛错 → 不外抛,日志吞掉", async () => {
    mock.module("#server/utils/rss", () => ({
      getSubscriptionStats: () => ({ totalRuns: 0 }),
      updateAllSubscribes: async () => {
        throw new Error("rss fetch exploded");
      },
    }));
    const { default: freshHandler } = await import("#server/api/admin/subscribes/update.post");
    // 吞掉 handler 内的 console.error,避免测试输出噪音
    const origErr = console.error;
    console.error = () => {};
    try {
      const r = (await callAdmin(freshHandler, {
        method: "POST",
        body: { csrfToken: CSRF_TOKEN },
        cookie: await cookie(),
      })) as { success: boolean };
      expect(r.success).toBe(true);
      // 等异步任务跑完再确认未抛
      await new Promise(r => setTimeout(r, 30));
    } finally {
      console.error = origErr;
    }
  });
});